import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";

import { AccountSecurityPanel } from "./components/AccountSecurityPanel";
import { AdminAuthCard } from "./components/AdminAuthCard";
import { AuthChallengeForm } from "./components/AuthChallengeForm";
import { EnrolledUsersPage } from "./components/EnrolledUsersPage";
import { UnenrolledUsersPage } from "./components/UnenrolledUsersPage";

export function initializePlugin() {
  PLUGIN_MULTI_FACTOR_AUTH.AuthChallengeForm = AuthChallengeForm;
  PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel = AccountSecurityPanel;
  PLUGIN_MULTI_FACTOR_AUTH.AdminAuthCard = AdminAuthCard;
  PLUGIN_MULTI_FACTOR_AUTH.EnrolledUsersPage = EnrolledUsersPage;
  PLUGIN_MULTI_FACTOR_AUTH.UnenrolledUsersPage = UnenrolledUsersPage;
}
