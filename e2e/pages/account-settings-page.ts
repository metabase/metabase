import { UserProfileForm } from "./widgets/account-settings/profile-form";
import { PasswordForm } from "./widgets/account-settings/password-form";
import { ProfileHeader } from "./widgets/account-settings/profile-header";
import { Radio } from "./widgets/shared/radio";
import { AppNavBar } from "./widgets/shared/app-nav-bar";

export class AccountSettingsPage {
  private _tabsSelector = Radio.byTestId("account-settings-tabs");

  navBar = new AppNavBar();
  header = new ProfileHeader();
  tabs = {
    profileForm: new UserProfileForm(),
    passwordForm: new PasswordForm(),
  };

  visit() {
    cy.visit("/account");
    return this;
  }

  visitProfileTab() {
    cy.visit("/account/profile");
    return this;
  }

  visitPasswordTab() {
    cy.visit("/account/password");
    return this;
  }

  selectTab = (tabName: string) => {
    this._tabsSelector.select(tabName);
    return this;
  };

  verifyTabSelected = (tabName: string) => {
    this._tabsSelector.verifySelected(tabName);
    return this;
  };
}
