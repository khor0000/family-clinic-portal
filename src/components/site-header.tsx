import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth, useSignOut, type AppRole } from "@/lib/auth";
import { CLINIC_NAME } from "@/lib/clinic";

type NavItem = { to: "/appointments" | "/book" | "/doctor" | "/admin"; label: string };

function navFor(role: AppRole | null): NavItem[] {
  if (role === "admin") return [{ to: "/admin", label: "Reception" }];
  if (role === "doctor") return [{ to: "/doctor", label: "My schedule" }];
  if (role === "patient")
    return [
      { to: "/appointments", label: "My appointments" },
      { to: "/book", label: "Book" },
    ];
  return [];
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 20c-4-2-7-5.5-7-9 2.5 0 5 1.2 7 4 2-2.8 4.5-4 7-4 0 3.5-3 7-7 9Z" />
          <path d="M12 15c-1.5-2.5-1.5-6 0-10 1.5 4 1.5 7.5 0 10Z" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold leading-none tracking-tight">
        {CLINIC_NAME}
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { session, ready, role } = useAuth();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const items = navFor(role);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="page-container flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "bg-accent text-accent-foreground" }}
            >
              {item.label}
            </Link>
          ))}
          {ready && session && (
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2 rounded-full">
              <LogOut /> Sign out
            </Button>
          )}
          {ready && !session && (
            <Button asChild size="sm" className="rounded-full px-5">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>

        <div className="md:hidden">
          {ready && !session ? (
            <Button asChild size="sm" className="rounded-full px-5">
              <Link to="/auth">Sign in</Link>
            </Button>
          ) : ready && session ? (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open menu" className="rounded-full">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle className="font-display">Menu</SheetTitle>
                </SheetHeader>
                <div className="mt-2 flex flex-col gap-1 px-4">
                  <p className="mb-2 truncate text-sm text-muted-foreground">{session.user.email}</p>
                  {items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="rounded-lg px-3 py-3 text-base font-medium hover:bg-accent"
                      activeProps={{ className: "bg-accent" }}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                  >
                    <LogOut /> Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      </div>
    </header>
  );
}
