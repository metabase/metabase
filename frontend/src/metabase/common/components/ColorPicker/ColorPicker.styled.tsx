// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const ContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 16.5rem;
  padding: 1rem;
`;

// Styles for react-colorful components
export const ControlsRoot = styled.div`
  .react-colorful {
    width: 100%;
    height: auto;
  }

  .react-colorful__saturation {
    height: 10rem;
    margin-bottom: 1rem;
    border-radius: 0.25rem;
  }

  .react-colorful__hue {
    height: 0.5rem;
    border-radius: 0.25rem;
  }

  .react-colorful__pointer {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--mb-color-bg-white);
    border-radius: 50%;
  }

  .react-colorful__hue-pointer {
    width: 0.625rem;
    height: 0.625rem;
  }
`;
