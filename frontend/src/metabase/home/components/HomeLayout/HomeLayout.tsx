import { ReactNode, useState } from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import MetabotWidget from "metabase/metabot/components/MetabotWidget";
import Tooltip from "metabase/core/components/Tooltip/Tooltip";
import { HomeGreeting } from "../HomeGreeting";
import { getHasIllustration } from "../../selectors";
import { CustomHomePageModal } from "../CustomHomePageModal";
import {
  LayoutBody,
  LayoutEditButton,
  LayoutIllustration,
  LayoutRoot,
} from "./HomeLayout.styled";

interface HomeLayoutProps {
  hasMetabot: boolean;
  children?: ReactNode;
}

export const HomeLayout = ({
  hasMetabot,
  children,
}: HomeLayoutProps): JSX.Element => {
  const [showModal, setShowModal] = useState(false);
  const isAdmin = useSelector(getUserIsAdmin);
  const hasIllustration = useSelector(getHasIllustration);

  return (
    <LayoutRoot>
      {hasIllustration && <LayoutIllustration />}
      {hasMetabot ? <MetabotWidget /> : <HomeGreeting />}
      {isAdmin && (
        <Tooltip tooltip={t`Pick a dashboard to serve as the homepage`}>
          <LayoutEditButton
            icon="pencil"
            borderless
            onClick={() => setShowModal(true)}
          >
            {t`Customize`}
          </LayoutEditButton>
        </Tooltip>
      )}
      <LayoutBody>{children}</LayoutBody>
      <CustomHomePageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </LayoutRoot>
  );
};
