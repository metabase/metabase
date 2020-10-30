/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { Box } from "grid-styled";

import Subhead from "metabase/components/type/Subhead";
import Radio from "metabase/components/Radio";

import {
  PageHeader,
  PageTabs,
  PageTools,
  PageContent,
} from "metabase/admin/components/Page";

const mapDispatchToProps = {
  onChangeTab: tab => push(tab),
};

const AdminPeopleApp = ({ children, onChangeTab }) => (
  <Box>
    <PageHeader>
      <PageTools>
        <Subhead>{t`People`}</Subhead>
      </PageTools>
      <PageTabs>
        <Radio
          options={[
            { name: t`Accounts`, value: "/admin/people" },
            { name: t`Groups`, value: "/admin/people/groups" },
          ]}
          value={location.pathname}
          onChange={onChangeTab}
          underlined
        />
      </PageTabs>
    </PageHeader>
    <PageContent>{children}</PageContent>
  </Box>
);

AdminPeopleApp.propTypes = {
  children: PropTypes.any,
  onChangeTab: PropTypes.func,
};

export default connect(
  null,
  mapDispatchToProps,
)(AdminPeopleApp);
