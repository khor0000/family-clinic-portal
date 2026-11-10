import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function ReferralButton({ path, name }: { path: string; name: string | null }) {
  const [loading, setLoading] = useState(false);

  async function open() {
    // Open the tab synchronously so phones don't block it as a pop-up.
    const win = window.open("", "_blank");
    setLoading(true);
    const { data, error } = await supabase.storage.from("referrals").createSignedUrl(path, 300);
    setLoading(false);
    if (error || !data?.signedUrl) {
      win?.close();
      toast.error("Couldn't open the referral letter.");
      return;
    }
    if (win) win.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={open} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <FileText />}
      <span className="max-w-[12rem] truncate">{name || "Referral letter"}</span>
    </Button>
  );
}
