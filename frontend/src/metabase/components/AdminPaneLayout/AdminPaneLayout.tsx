import type { ReactNode } from "react";

import { AdminPaneTitle } from "./AdminPaneTitle";
import type { AdminPaneProps } from "./types";

type AdminPaneLayoutProps = AdminPaneProps & {
  children: ReactNode;
};

export const AdminPaneLayout = ({
  title,
  description,
  buttonText,
  buttonAction,
  buttonDisabled,
  children,
  buttonLink,
  headingContent,
}: AdminPaneLayoutProps) => (
  <div data-testid="admin-panel">
    <AdminPaneTitle
      title={title}
      description={description}
      buttonText={buttonText}
      buttonAction={buttonAction}
      buttonDisabled={buttonDisabled}
      buttonLink={buttonLink}
      headingContent={headingContent}
    />
    {children}
  </div>
);
