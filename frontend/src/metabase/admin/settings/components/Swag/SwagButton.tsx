import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import AdminS from "metabase/css/admin.module.css";

import { SwagModal } from "./SwagModal";
import { SWAG_51_LOCAL_STORAGE_KEY } from "./constants";
import { isSwagEnabled } from "./utils";

export const SwagButton = () => {
  const version = useSetting("version");
  const [modalOpen, setModalOpen] = useState(false);

  // Need to check the value again when modal closes to remove animation
  // So the modal opening / closing is a dependency here
  const isLinkUsed = useMemo(() => {
    const rawValue = localStorage.getItem(SWAG_51_LOCAL_STORAGE_KEY);
    return rawValue === "true";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  if (!isSwagEnabled(version.tag)) {
    return null;
  }

  return (
    <>
      <li
        className={cx(AdminS.SwagButton, { [AdminS.LameSwag]: isLinkUsed })}
        aria-disabled={isLinkUsed ? true : false}
        onClick={() => setModalOpen(true)}
        data-testid="swag-button"
      >
        <span>{t`👕 Claim your swag`}</span>
      </li>
      <SwagModal opened={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};
