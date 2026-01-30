// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { FormField } from "metabase/common/components/FormField";
import { Radio } from "metabase/common/components/Radio";
import { darken } from "metabase/lib/colors";

export const FormFieldContainer = styled.div`
  background-color: var(--mb-color-background-primary);
  border: 1px solid var(--mb-color-border);
  border-radius: var(--mantine-spacing-sm);
  overflow: hidden;
`;

const ContentContainer = styled.div`
  display: flex;
  gap: var(--mantine-spacing-sm);
`;

export const EditorContainer = styled(ContentContainer)`
  display: flex;
  padding: 1rem 1rem 0.85rem 0.85rem;
  gap: var(--mantine-spacing-sm);

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
  flex: ${(props) => (props.full ? 1 : "unset")};
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Title = styled.div`
  color: var(--mb-color-text-primary);
  font-weight: 700;
`;

export const Subtitle = styled.div`
  color: var(--mb-color-text-secondary);
  font-size: 0.85rem;
  font-weight: 700;
  margin-top: 1.2rem;
`;

export const PreviewContainer = styled(ContentContainer)`
  background-color: var(--mb-color-background-secondary);
  border-top: 1px solid ${() => darken("background-secondary", 0.1)};
  padding: 1rem 1rem 2rem 1rem;

  ${FormField.Root} {
    margin-bottom: 0;
  }

  ${FormField.Label} {
    color: var(--mb-color-text-primary);
  }
`;

export const InputContainer = styled.div`
  flex: 1 0 1;
`;
