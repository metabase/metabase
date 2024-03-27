import cx from "classnames";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";

import { Container, HeadingContainer } from "./AdminPaneLayout.styled";
import type { AdminPaneProps } from "./types";

export const AdminPaneTitle = ({
  title,
  description,
  buttonText,
  buttonAction,
  buttonDisabled,
  buttonLink,
  headingContent,
}: AdminPaneProps) => {
  const buttonClassName = cx(CS.mlAuto, CS.flexNoShrink);
  return (
    <Container>
      <HeadingContainer>
        {headingContent && <>{headingContent}</>}
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
      {description && <p className={CS.textMeasure}>{description}</p>}
    </Container>
  );
};
