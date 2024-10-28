import styled from "@emotion/styled";

/**
 * The height of the header for the query builder view.
 * Currently hard coded based on the observation from the dev tools.
 * It prevents the header from jumping when the notebook view is toggled.
 *
 * If we want to calculate this heaight based on the children of the header,
 * we have to take into account the size of the buttons being used, as well as
 * their line-height + font size. We should add the padding and the border to that.
 *
 * @link https://github.com/metabase/metabase/issues/40334
 */
export const NativeQueryEditorContainer = styled.div`
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--mb-color-border);
  z-index: 2;
`;
