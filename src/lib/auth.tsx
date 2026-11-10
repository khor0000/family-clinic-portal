import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const rolesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["roles", userId],
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.role);
    },
    staleTime: 60_000,
  });

export function primaryRole(roles: AppRole[]): AppRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("doctor")) return "doctor";
  return "patient";
}

export function homeFor(role: AppRole): "/admin" | "/doctor" | "/appointments" {
  if (role === "admin") return "/admin";
  if (role === "doctor") return "/doctor";
  return "/appointments";
}

/** Only allow same-origin relative paths as post-login destinations. */
export function safeRedirect(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (url.pathname.startsWith("/auth")) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

type AuthState = {
  session: Session | null;
  ready: boolean;
  roles: AppRole[];
  role: AppRole | null;
};

const AuthContext = createContext<AuthState>({ session: null, ready: false, roles: [], role: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setReady(true);
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  const userId = session?.user.id;
  const { data: roles = [] } = useQuery({
    ...rolesQuery(userId ?? "none"),
    enabled: !!userId,
  });

  return (
    <AuthContext.Provider
      value={{ session, ready, roles, role: userId && roles.length ? primaryRole(roles) : null }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}
