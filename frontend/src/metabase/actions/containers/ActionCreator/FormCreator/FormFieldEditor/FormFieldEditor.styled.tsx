import styled from "@emotion/styled";

import FormField from "metabase/core/components/FormField";
import Radio from "metabase/core/components/Radio";
import { darken } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

const DRAG_HANDLE_SIZE = 12;

export const FormFieldContainer = styled.div`
  background-color: var(--mb-color-bg-white);
  border: 1px solid var(--mb-color-border);
  border-radius: ${space(1)};
  overflow: hidden;
`;

const ContentContainer = styled.div`
  display: flex;
  gap: ${space(1)};
`;

export const EditorContainer = styled(ContentContainer)`
  display: flex;
  padding: 1rem 1rem 0.85rem 0.85rem;
  gap: ${space(1)};

  ${Radio.RadioGroupVariants.join(", ")} {
    margin-top: 10px;
  }

  ${Radio.RadioContainerVariants.join(", ")} {
    padding: 4px 10px;
  }
`;

export const Column = styled.div<{ full?: boolean }>`
  display: flex;
  flex-direction: column;
  flex: ${props => (props.full ? 1 : "unset")};

  min-width: ${DRAG_HANDLE_SIZE}px;
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Title = styled.div`
  color: var(--mb-color-text-dark);
  font-weight: 700;
`;

export const Subtitle = styled.div`
  color: var(--mb-color-text-medium);
  font-size: 0.85rem;
  font-weight: 700;

  margin-top: 1.2rem;
`;

export const DragHandle = styled(Icon)`
  color: var(--mb-color-text-medium);
  margin-top: 4px;
`;

DragHandle.defaultProps = { size: DRAG_HANDLE_SIZE };

export const PreviewContainer = styled(ContentContainer)`
  background-color: var(--mb-color-bg-light);
  border-top: 1px solid ${() => darken("bg-light", 0.1)};

  padding: 1rem 1rem 2rem 1rem;

  ${FormField.Root} {
    margin-bottom: 0;
  }

  ${FormField.Label} {
    color: var(--mb-color-text-dark);
  }
`;

export const InputContainer = styled.div`
  flex: 1 0 1;
`;
