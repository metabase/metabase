/* eslint-disable react/prop-types */
import React from "react";

import { Button } from "metabase/core/components/Button";
import { Link } from "metabase/core/components/Link";

import { Container, HeadingContainer } from "./AdminPaneLayout.styled";

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
        {headingContent && <React.Fragment>{headingContent}</React.Fragment>}
        {title && <h2 className="PageTitle">{title}</h2>}
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
  <div className="wrapper">
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
