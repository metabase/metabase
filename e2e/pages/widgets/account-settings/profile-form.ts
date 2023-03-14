import { Select } from "../shared/select";
import { Input } from "../shared/input";
import { Button } from "../shared/button";

type ProfileFormValues = {
  firstName?: string;
  lastName?: string;
  email?: string;
  language?: string;
};

export class UserProfileForm {
  private firstNameInput = Input.byLabel("First name");
  private lastNameInput = Input.byLabel("Last name");
  private emailInput = Input.byLabel("Email");
  // TODO: make it more specific
  private languageSelect = Select.byTestId("select-button");
  private submitButton = Button.byLabel("Update");

  verifyValues = ({
    firstName,
    lastName,
    email,
    language,
  }: ProfileFormValues) => {
    if (firstName != null) {
      this.firstNameInput.verifyValue(firstName);
    }

    if (lastName != null) {
      this.lastNameInput.verifyValue(lastName);
    }

    if (email != null) {
      this.emailInput.verifyValue(email);
    }

    if (language != null) {
      this.languageSelect.verifySelectedValue(language);
    }

    return this;
  };

  fill = ({ firstName, lastName, email, language }: ProfileFormValues) => {
    if (firstName != null) {
      this.firstNameInput.setValue(firstName);
    }

    if (lastName != null) {
      this.lastNameInput.setValue(lastName);
    }

    if (email != null) {
      this.emailInput.setValue(email);
    }

    if (language != null) {
      this.languageSelect.select(language);
    }

    return this;
  };

  submit = () => {
    cy.intercept("PUT", "/api/user/*").as("updateUserSettings");
    this.submitButton.click();
    cy.wait("@updateUserSettings");
    return this;
  };

  verifySubmitDisabled = () => {
    this.submitButton.verifyDisabled();
    return this;
  };
}
