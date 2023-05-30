import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";

import { Radio } from "metabase/core/components/Radio";
import { getUserIsAdmin } from "metabase/selectors/user";

import { ModelEducationalModal } from "./ModelEducationalModal";
import { NavBar, ModelEducationButton } from "./DataModelApp.styled";

const propTypes = {
  onChangeTab: PropTypes.func.isRequired,
  location: PropTypes.shape({
    pathname: PropTypes.string.isRequired,
  }).isRequired,
  children: PropTypes.node.isRequired,
  isAdmin: PropTypes.bool,
};

const mapStateToProps = state => ({
  isAdmin: getUserIsAdmin(state),
});

const mapDispatchToProps = {
  onChangeTab: tab => push(`/admin/datamodel/${tab}`),
};

const TAB = {
  SEGMENTS: "segments",
  METRICS: "metrics",
  DATABASE: "database",
};

function DataModelApp({
  children,
  onChangeTab,
  location: { pathname },
  isAdmin,
}) {
  const [
    isModelEducationalModalShown,
    { turnOn: showModelEducationalModal, turnOff: hideModelEducationalModal },
  ] = useToggle(false);

  const currentTab = useMemo(() => {
    if (/\/segments?/.test(pathname)) {
      return TAB.SEGMENTS;
    }
    if (/\/metrics?/.test(pathname)) {
      return TAB.METRICS;
    }
    return TAB.DATABASE;
  }, [pathname]);

  const options = [
    { name: t`Data`, value: TAB.DATABASE },
    ...(isAdmin
      ? [
          { name: t`Segments`, value: TAB.SEGMENTS },
          { name: t`Metrics`, value: TAB.METRICS },
        ]
      : []),
  ];

  return (
    <React.Fragment>
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
    </React.Fragment>
  );
}

DataModelApp.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(DataModelApp);
