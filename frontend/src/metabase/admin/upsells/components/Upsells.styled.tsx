import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";

/**
 * The upsell color palette is designed to function in harmony with the original Metabase set of Blues, Grays and Purples
 * but with a twist. All three colors are new and should not be used elsewhere in the product experience.
 */
export const upsellColors = {
  primary: "#005999",
  secondary: "#BFF4FF",
  gem: "#00D4FF",
};

export const UpsellPillComponent = styled(ExternalLink)`
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  flex-grow: 0;
  font-weight: bold;
  font-size: 0.75rem;
  text-decoration: none;
  padding: 0.25rem 0.75rem;
  border-radius: 2rem;
  border: 1px solid ${upsellColors.secondary};
  color: ${upsellColors.primary};

  &:hover {
    background-color: ${upsellColors.primary};
    color: ${color("white")};
    border: 1px solid ${upsellColors.primary};
  }
`;

export const UpsellCTALink = styled(ExternalLink)`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  flex-grow: 0;
  font-weight: bold;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 2rem;
  margin-inline: 1rem;
  margin-bottom: 1.5rem;
  color: ${upsellColors.primary};
  background-color: ${upsellColors.secondary};
  text-decoration: none;

  &:hover {
    background-color: ${upsellColors.primary};
    color: ${color("white")};
  }
`;

export const UpsellCardComponent = styled.div`
  max-width: 200px;
  box-sizing: content-box;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid ${upsellColors.secondary};
  background-color: ${color("white")};
`;
