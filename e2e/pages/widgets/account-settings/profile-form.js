import { Select } from "../shared/select";
import { Input } from "../shared/input";

export class UserProfileForm {
  firstNameInput = Input.byLabel("First name");
  lastNameInput = Input.byLabel("Last name");
  emailInput = Input.byLabel("Email");
  // TODO: make it more specific
  languageSelect = Select.byTestId("select-button");
  submitButton = () => cy.button("Update");

  verifyValues = ({ firstName, lastName, email, language }) => {
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

  fill = ({ firstName, lastName, email, language }) => {
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
    this.submitButton().click();
    return this;
  };

  verifySubmitDisabled = () => {
    this.submitButton().should("be.disabled");
    return this;
  };
}
