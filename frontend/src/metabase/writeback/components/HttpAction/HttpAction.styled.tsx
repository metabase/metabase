import styled from "@emotion/styled";
import { color, alpha, lighten } from "metabase/lib/colors";

const brandLight = lighten(color("brand"), 0.25);

const SPACE_LEVELS = [2, 4, 8, 16, 32, 64, 128];

const space = (level: number, multiplier = 1) =>
  (SPACE_LEVELS[level] || 0) * multiplier;

// Replace tw classes
export const Container = styled.div`
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  .flex-grow {
    flex-grow: 1;
  }

  .font-semibold {
    font-weight: 600;
  }

  .placeholder-text-light::placeholder {
    color: ${color("light")};
  }

  @media screen and (--breakpoint-min-sm) {
    .sm\:text-small {
      font-size: 0.875rem;
    }

    .hidden {
      display: none;
    }

    .sm\:hidden {
      display: none;
    }
  }

  .py0 {
    padding-top: 0;
    padding-bottom: 0;
  }

  .min-h-0 {
    min-height: 0;
  }

  .pr-12 {
    padding-right: 3rem;
  }

  .pr-7 {
    padding-right: 1.75rem;
  }

  .px-6 {
    padding-top: 1.5rem;
    padding-bottom: 1.5rem;
  }

  .resize-none {
    resize: none;
  }

  .focus\:text-dark {
    color: ${color("text-dark")};
  }

  .focus\:border-transparent {
    border-color: transparent;
  }

  .items-start {
    align-items: flex-start;
  }

  .justify-between {
    justify-content: space-between;
  }

  .grid {
    display: grid;
  }

  .grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }

  @media screen and (--breakpoint-min-md) {
    .md\:flex-row {
      flex-direction: row;
    }
  }

  .border-t {
    border-top: 1px solid ${color("border")};
  }

  .border-bottom {
    border-top: 1px solid ${color("border")};
  }
`;
