import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Button from "metabase/components/Button";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";

export const HeaderRoot = styled.div`
  margin-bottom: 1.5rem;
`;

export const HeaderTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.5rem;
  line-height: 1.875rem;
  margin-bottom: 0.25rem;
`;

export const HeaderMessage = styled.div`
  color: ${color("text-medium")};
  line-height: 1.5rem;
`;

export const SectionRoot = styled.div`
  margin-bottom: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
`;

export const SectionTitle = styled.div`
  flex: 1 1 auto;
  margin-right: 1rem;
  color: ${color("brand")};
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.5rem;
`;

export const SectionToggle = styled(Button)`
  flex: 0 0 auto;
  color: ${color("brand")};
  width: 2.5rem;
  height: 2.5rem;
`;

export const SectionBody = styled.div`
  padding: 1rem;
  border-top: 1px solid ${color("border")};
`;

export const SectionMessage = styled.div`
  color: ${color("text-medium")};
  line-height: 1.5rem;
  margin-bottom: 1.5rem;
`;

export const SectionLink = styled(ExternalLink)`
  color: ${color("brand")};
  font-weight: 700;
`;

export const SectionButton = styled(ExternalLink)`
  display: inline-flex;
  align-items: center;
  padding: 0.75rem 1.25rem;
`;

export const SectionButtonText = styled.div`
  font-weight: 700;
`;

export const SectionButtonIcon = styled(Icon)`
  color: ${color("white")};
  margin-left: 0.5rem;
  width: 0.75rem;
  height: 0.75rem;
`;

export const SectionCode = styled.div`
  min-height: 10rem;
  max-height: 19rem;
  padding: 1rem;
  border: 1px solid ${color("brand")};
  border-radius: 0.5rem;
  background-color: ${color("brand-light")};
  overflow: auto;
  white-space: pre;
`;
