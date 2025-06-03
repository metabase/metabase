// TODO(npretto): migrate to css modules
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

type StepStyleProps = {
  status: "completed" | "active" | "pending";
};

// For the connecting line, assuming it's part of the wrapper or circle
export const StepWrapper = styled.div<StepStyleProps>`
  position: relative; // For positioning the connecting line
  padding: 0.5rem 0; // Vertical spacing between items
  margin-left: 1rem; // To give space for the circle to not be at the very edge
  display: flex; // To align circle and content if needed, though StepContent will do most of this
  align-items: flex-start; // Align items to the top if titles wrap

  // Connecting line for all but the last item
  &:not(:last-child)::before {
    content: "";
    position: absolute;
    left: 1rem; // Should align with the center of the StepCircle (width/2)
    top: 2.5rem; // Start below the current circle
    bottom: -0.5rem; // Extend to the next circle's top (approx)
    width: 2px;
    background-color: var(--mb-color-border-light);
    z-index: -1; // Behind the circle
  }
`;

export const StepContent = styled.div`
  display: flex;
  align-items: center;
`;

export const StepCircle = styled.div<StepStyleProps>`
  width: 2.25rem; // Slightly larger circle
  height: 2.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-right: 1rem;
  flex-shrink: 0;
  border: 2px solid transparent; // Base border, color/width changes by status

  background-color: ${({ status }) => {
    if (status === "completed") {
      return color("success");
    }
    // Active and Pending have white backgrounds, border provides color
    return "var(--mb-color-bg-white)";
  }};

  border-color: ${({ status }) => {
    if (status === "active") {
      return "var(--mb-color-brand)";
    } // Blue border for active
    if (status === "pending") {
      return "var(--mb-color-border-strong)";
    } // Grey border for pending
    return color("success"); // Match background for completed (effectively no border visible)
  }};

  // Icon/Number color within the circle
  color: ${({ status }) => {
    if (status === "active") {
      return "var(--mb-color-brand)";
    } // Blue icon/num for active
    if (status === "pending") {
      return "var(--mb-color-text-medium)";
    } // Grey icon/num for pending
    return "var(--mb-color-text-white)"; // White icon/num for completed
  }};
`;

export const StepIcon = styled(Icon)`
  width: 1.25rem; // Slightly larger icons
  height: 1.25rem;
`;

export const StepNumber = styled.span`
  font-size: 1rem; // Larger number
`;

export const StepTitle = styled.span<StepStyleProps>`
  font-size: 1rem;
  font-weight: 500; // Medium weight generally
  color: ${({ status }) => {
    if (status === "active") {
      return "var(--mb-color-brand)";
    }
    if (status === "pending") {
      return "var(--mb-color-text-medium)";
    }
    return "var(--mb-color-text-dark)";
  }};
`;
