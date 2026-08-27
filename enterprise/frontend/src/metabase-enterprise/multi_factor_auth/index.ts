import {
  PLUGIN_MULTI_FACTOR_AUTH,
  lazyPluginComponent,
} from "metabase/plugins";

const enrolledUsersPage = () =>
  import(
    /* webpackChunkName: "mfa-enrolled-users" */ "./components/EnrolledUsersPage"
  ).then(({ EnrolledUsersPage }) => ({
    Component: EnrolledUsersPage,
  }));

const unenrolledUsersPage = () =>
  import(
    /* webpackChunkName: "mfa-unenrolled-users" */ "./components/UnenrolledUsersPage"
  ).then(({ UnenrolledUsersPage }) => ({ Component: UnenrolledUsersPage }));

export function initializePlugin() {
  PLUGIN_MULTI_FACTOR_AUTH.AuthChallengeForm = lazyPluginComponent(() =>
    import("./components/AuthChallengeForm").then(
      ({ AuthChallengeForm }) => AuthChallengeForm,
    ),
  );
  PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel = lazyPluginComponent(() =>
    import("./components/AccountSecurityPanel").then(
      ({ AccountSecurityPanel }) => AccountSecurityPanel,
    ),
  );
  PLUGIN_MULTI_FACTOR_AUTH.AdminAuthCard = lazyPluginComponent(() =>
    import("./components/AdminAuthCard").then(
      ({ AdminAuthCard }) => AdminAuthCard,
    ),
  );
  PLUGIN_MULTI_FACTOR_AUTH.enrolledUsersPage = enrolledUsersPage;
  PLUGIN_MULTI_FACTOR_AUTH.unenrolledUsersPage = unenrolledUsersPage;
}
