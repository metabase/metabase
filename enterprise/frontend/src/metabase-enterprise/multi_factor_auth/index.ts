import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";

import { AccountSecurityPanel } from "./components/AccountSecurityPanel";
import { AdminAuthCard } from "./components/AdminAuthCard";
import { AuthChallengeForm } from "./components/AuthChallengeForm";

const enrolledUsersPage = () =>
  import("./components/EnrolledUsersPage").then(({ EnrolledUsersPage }) => ({
    Component: EnrolledUsersPage,
  }));

const unenrolledUsersPage = () =>
  import("./components/UnenrolledUsersPage").then(
    ({ UnenrolledUsersPage }) => ({ Component: UnenrolledUsersPage }),
  );

export function initializePlugin() {
  PLUGIN_MULTI_FACTOR_AUTH.AuthChallengeForm = AuthChallengeForm;
  PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel = AccountSecurityPanel;
  PLUGIN_MULTI_FACTOR_AUTH.AdminAuthCard = AdminAuthCard;
  PLUGIN_MULTI_FACTOR_AUTH.enrolledUsersPage = enrolledUsersPage;
  PLUGIN_MULTI_FACTOR_AUTH.unenrolledUsersPage = unenrolledUsersPage;
}
