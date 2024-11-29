import styled from "@emotion/styled";

export const SavedEntityPickerRoot = styled.div`
  display: flex;
  width: 620px;
  overflow: hidden;
  border-top: 1px solid var(--mb-color-border);

  @media screen and (max-width: 40em) {
    flex-direction: column;
    width: 300px;
    overflow: auto;
  }
`;

export const CollectionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 310px;
  background-color: var(--mb-color-bg-light);
  overflow: auto;

  @media screen and (max-width: 40em) {
    min-height: 220px;
    border-bottom: 1px solid var(--mb-color-border);
  }
`;

export const BackButton = styled.a`
  font-weight: 700;
  font-size: 16px;
  display: flex;
  align-items: center;
  color: var(--mb-color-text-dark);
  border-bottom: 1px solid var(--mb-color-border);
  padding: 1rem;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const TreeContainer = styled.div`
  margin: 0.5rem 0;
`;
