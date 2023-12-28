import styled from "@emotion/styled";
import { Icon } from "metabase/core/components/Icon";
import ExternalLink from "metabase/core/components/ExternalLink";

import { color, lighten, alpha } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const FormContainer = styled.div`
  display: flex;
  gap: ${space(2)};
  padding: 0 1.5rem 1rem;
  transition: flex 500ms ease-in-out;
  background-color: ${color("white")};
  flex-direction: column;
`;

export const FormFieldEditorDragContainer = styled.div`
  margin-bottom: ${space(1)};
`;

export const InfoText = styled.div`
  color: ${color("text-medium")};
`;

export const FieldSettingsButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${space(1)};
`;

export const EmptyFormPlaceholderWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  padding: 3rem;
`;

export const ExplainerTitle = styled.h3`
  margin-bottom: ${space(1)};
`;

export const ExplainerText = styled.div`
  font-weight: 400;
  line-height: 1.5rem;
  color: ${color("text-medium")};
  margin: ${space(1)} 0 0 0;
`;

export const ExplainerList = styled.ul`
  list-style-type: disc;
  margin-left: 1.5rem;

  li {
    font-weight: 400;
    line-height: 24px;
    color: ${color("text-medium")};
    margin: 0;
  }
`;

export const ExplainerLink = styled(ExternalLink)`
  font-weight: 700;
  margin-top: ${space(2)};

  color: ${color("brand")};

  &:hover {
    color: ${lighten("brand", 0.1)};
  }
`;

export const IconContainer = styled.div`
  display: inline-block;
  padding: 1.25rem;
  position: relative;
  color: ${color("brand")};
  align-self: center;
`;

export const TopRightIcon = styled(Icon)`
  position: absolute;
  top: 0;
  right: 0;
`;

export const WarningBanner = styled.div`
  padding: ${space(2)};
  border: 1px solid ${color("warning")};
  border-radius: ${space(1)};
  background: ${alpha("warning", 0.1)};
  line-height: 1.25rem;
`;
