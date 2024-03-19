/* eslint-disable react/prop-types */
import { Fragment } from "react";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";

import { Container, HeadingContainer } from "./AdminPaneLayout.styled";
import CS from "metabase/css/core/index.css";

const AdminPaneTitle = ({
  title,
  description,
  buttonText,
  buttonAction,
  buttonDisabled,
  buttonLink,
  headingContent,
}) => {
  const buttonClassName = "ml-auto flex-no-shrink";
  return (
    <Container>
      <HeadingContainer>
        {headingContent && <Fragment>{headingContent}</Fragment>}
        {title && (
          <h2 data-testid="admin-pane-page-title" className={CS.m0}>
            {title}
          </h2>
        )}
        {buttonText && buttonLink && (
          <Link to={buttonLink} className={buttonClassName}>
            <Button primary>{buttonText}</Button>
          </Link>
        )}
        {buttonText && buttonAction && (
          <Button
            className={buttonClassName}
            primary={!buttonDisabled}
            disabled={buttonDisabled}
            onClick={buttonAction}
          >
            {buttonText}
          </Button>
        )}
      </HeadingContainer>
      {description && <p className="text-measure">{description}</p>}
    </Container>
  );
};

const AdminPaneLayout = ({
  title,
  description,
  buttonText,
  buttonAction,
  buttonDisabled,
  children,
  buttonLink,
  headingContent,
}) => (
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

export default AdminPaneLayout;
