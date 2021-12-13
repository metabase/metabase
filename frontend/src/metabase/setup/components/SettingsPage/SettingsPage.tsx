import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { PageHeader, PageBody } from "./SettingsPage.styled";
import LanguageStep from "../../containers/LanguageStep";
import UserStep from "../../containers/UserStep";
import SetupFooter from "../SetupFooter";

const SettingsPage = () => (
  <div>
    <PageHeader>
      <LogoIcon height={51} />
    </PageHeader>
    <PageBody>
      <LanguageStep />
      <UserStep />
      <SetupFooter />
    </PageBody>
  </div>
);

export default SettingsPage;
