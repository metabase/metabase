import cx from "classnames";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";

import { Container, HeadingContainer } from "./AdminPaneLayout.styled";
import type { AdminPaneProps } from "./types";
import { Icon } from "metabase/ui";

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
    <Container style={{ paddingLeft: "2rem", paddingRight: "2rem" }}>
      <HeadingContainer>
        {headingContent && <>{headingContent}</>}
        {title && (
          <h2 data-testid="admin-pane-page-title" className={CS.m0}>
            {title}
          </h2>
        )}
        {buttonText && buttonLink && (
          <Link to={buttonLink} className={buttonClassName}>
            <button
              style={{
                backgroundColor: "transparent",
                border: "none",
                display: "flex", // Use flexbox for alignment
                alignItems: "center", // Center items vertically
                gap: "0.5rem", // Add some spacing between the icon and text
                cursor: "pointer",
                padding: "0.5rem",
              }}
            >
              <Icon name="add" size={14} />
              <span style={{ fontSize: "14px" }}>{buttonText}</span>
            </button>
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
