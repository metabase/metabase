import PropTypes from "prop-types";

import { AccountHeader } from "../AccountHeader";
import { AccountImage } from "./AccountImage";
import { CompanyHeader } from "metabase/browse/components/CompanySettings/CompanyHeader";
import {
  AccountContent, BrowseContainer,
  BrowseMain
} from "./AccountLayout.styled";
import { t } from "ttag";


const propTypes = {
  ...AccountHeader.propTypes,
  children: PropTypes.node,
};

const AccountLayout = ({ children, ...props }) => {
  return (

    <BrowseContainer>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: "1rem",
          width: "100%",
          paddingRight: "2rem",
          gap: "2rem",
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "start", width: "100%" }}
        >
          <CompanyHeader title={t`Account settings`} icon={"person"} />
        </div>
        <div
          style={{ display: "flex", justifyContent: "start", width: "100%" }}
        >
          <AccountImage {...props} />
        </div>
      </div>
      <BrowseMain style={{ marginTop: "4rem" }}>
        <AccountHeader {...props} />
        <AccountContent>{children}</AccountContent>
      </BrowseMain>
    </BrowseContainer>
  );
};

AccountLayout.propTypes = propTypes;

export default AccountLayout;
