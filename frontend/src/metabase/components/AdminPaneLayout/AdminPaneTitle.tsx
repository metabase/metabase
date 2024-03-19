import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";

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
  const buttonClassName = "ml-auto flex-no-shrink";
  return (
    <Container>
      <HeadingContainer>
        {headingContent && <>{headingContent}</>}
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
