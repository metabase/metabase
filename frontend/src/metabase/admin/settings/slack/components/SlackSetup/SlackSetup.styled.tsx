import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import { breakpointMinLarge } from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/components/ExternalLink";
import SlackHelpCard from "../SlackHelpCard";

export const SetupRoot = styled.div`
  max-width: 42rem;
  padding-left: 1rem;
`;

export const HeaderRoot = styled.header`
  margin-bottom: 1.5rem;
`;

export const HeaderTitle = styled.h2`
  color: ${color("text-dark")};
  font-size: 1.5rem;
  font-weight: bold;
  line-height: 1.875rem;
  margin: 0 0 0.5rem;
`;

export const HeaderMessage = styled.div`
  color: ${color("text-medium")};
`;

export const SectionRoot = styled.section`
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  margin-bottom: 2rem;

  ${breakpointMinLarge} {
    &:last-of-type {
      margin-bottom: 0;
    }
  }
`;

export const SectionHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
`;

export const SectionTitle = styled.h3`
  flex: 1 1 auto;
  margin: 0 1rem 0 0;
  color: ${color("brand")};
  font-size: 1rem;
  font-weight: bold;
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
  font-weight: bold;
`;

export const SectionCode = styled.div`
  position: relative;
  height: 19rem;
  border: 1px solid ${color("brand")};
  border-radius: 0.5rem;
  background-color: ${lighten("brand", 0.6)};
  overflow: auto;
`;

export const SectionCodeContent = styled.div`
  padding: 1rem;
  font-size: 0.75rem;
  font-family: Monaco, monospace;
  white-space: pre;
`;

export const SectionCodeButton = styled(Button)`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background-color: ${color("white")};
`;

export const SetupHelpCard = styled(SlackHelpCard)`
  ${breakpointMinLarge} {
    position: fixed;
    right: 2rem;
    bottom: 2rem;
    max-width: 15%;
  }
`;
