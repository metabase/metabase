interface Props {
  value: Map<number, string>; // TODO: does it need to be a Map?
  onChange: (value: Map<number, string>) => void;
}

export const CustomMappingModal = ({ value, onChange }: Props) => (
  <div>CustomMappingModal</div>
);
