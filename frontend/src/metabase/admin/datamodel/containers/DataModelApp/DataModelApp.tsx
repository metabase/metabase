import type { Location } from "history";
import { Fragment, type ReactNode, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import Radio from "metabase/common/components/Radio";
import { useToggle } from "metabase/common/hooks/use-toggle";
import { connect } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

import { ModelEducationButton, NavBar } from "./DataModelApp.styled";
import { ModelEducationalModal } from "./ModelEducationalModal";

const mapStateToProps = (state: State) => ({
  isAdmin: getUserIsAdmin(state),
});

const mapDispatchToProps = {
  onChangeTab: (tab: string) => push(`/admin/datamodel/${tab}`),
};

const TAB = {
  SEGMENTS: "segments",
  DATABASE: "database",
};

interface Props {
  children: ReactNode;
  isAdmin?: boolean;
  location: Location;
  onChangeTab: (tab: string) => void;
}

function DataModelAppBase({
  children,
  isAdmin,
  location: { pathname },
  onChangeTab,
}: Props) {
  const [
    isModelEducationalModalShown,
    { turnOn: showModelEducationalModal, turnOff: hideModelEducationalModal },
  ] = useToggle(false);

  const currentTab = useMemo(() => {
    if (/\/segments?/.test(pathname)) {
      return TAB.SEGMENTS;
    }
    return TAB.DATABASE;
  }, [pathname]);

  const options = [
    { name: t`Data model`, value: TAB.DATABASE },
    ...(isAdmin ? [{ name: t`Segments`, value: TAB.SEGMENTS }] : []),
  ];

  return (
    <Fragment>
      <NavBar>
        <Radio
          value={currentTab}
          options={options}
          onChange={onChangeTab}
          variant="underlined"
        />
        <ModelEducationButton
          onClick={showModelEducationalModal}
        >{t`Simplify your schema with Models`}</ModelEducationButton>
      </NavBar>
      <ModelEducationalModal
        isOpen={isModelEducationalModalShown}
        onClose={hideModelEducationalModal}
      />
      {children}
    </Fragment>
  );
}

export const DataModelApp = connect(
  mapStateToProps,
  mapDispatchToProps,
)(DataModelAppBase);
