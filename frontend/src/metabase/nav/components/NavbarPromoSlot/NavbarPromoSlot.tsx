import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import { PLUGIN_SECURITY_CENTER } from "metabase/plugins";

import S from "./NavbarPromoSlot.module.css";

export function NavbarPromoSlot() {
  const { SecurityCenterPromoCard } = PLUGIN_SECURITY_CENTER;

  return (
    <div className={S.PromoSlot}>
      <SecurityCenterPromoCard />
      <WhatsNewNotification />
    </div>
  );
}
