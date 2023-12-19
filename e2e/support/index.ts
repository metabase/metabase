declare global {
  namespace Cypress {
    interface Chainable {
      // from: e2e/support/commands/authentication.js
      signIn: (user?: string) => void;
      signInAsAdmin: () => void;
      signInAsNormalUser: () => void;
      signInAsSandboxedUser: () => void;
      signInAsImpersonatedUser: () => void;
      signOut: () => void;
    }
  }
}

export {};
