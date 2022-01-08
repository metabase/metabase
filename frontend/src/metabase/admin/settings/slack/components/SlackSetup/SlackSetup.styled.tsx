import styled from "styled-components";
import { alpha, color } from "metabase/lib/colors";
import Button from "metabase/components/Button";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";

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

export const BannerRoot = styled.div`
  display: flex;
  align-items: center;
  margin-top: 1rem;
  padding: 1rem 1.5rem;
  border: 1px solid ${color("error")};
  border-radius: 0.5rem;
  background-color: ${alpha("error", 0.12)};
`;

export const BannerIcon = styled(Icon)`
  flex: 0 0 auto;
  color: ${color("error")};
  margin-right: 1rem;
`;

export const BannerText = styled.div`
  color: ${color("text-dark")};
`;

export const SectionRoot = styled.section`
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
  min-height: 10rem;
  max-height: 19rem;
  padding: 1rem;
  border: 1px solid ${color("brand")};
  border-radius: 0.5rem;
  background-color: ${color("brand-light")};
  overflow: auto;
  white-space: pre;
`;
