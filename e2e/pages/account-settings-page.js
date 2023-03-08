import { UserProfileForm } from "./widgets/account-settings/profile-form";
import { PasswordForm } from "./widgets/account-settings/password-form";
import { ProfileHeader } from "./widgets/account-settings/profile-header";

export class AccountSettingsPage {
  static url = () => "/account";

  static visit = () => {
    return new AccountSettingsPage().visit();
  };

  visit() {
    cy.visit(AccountSettingsPage.url());
    return this;
  }

  header = new ProfileHeader();
  profileForm = new UserProfileForm();
  passwordForm = new PasswordForm();
}
