import { Icon, NavLink, Paper } from "metabase/ui";

interface SimpleDataPickerProps {
  options: Options[];
  onClick: (option: any) => void;
}

interface Options {
  id: number;
  display_name: string;
}

export function SimpleDataPicker({ options, onClick }: SimpleDataPickerProps) {
  return (
    <Paper w="300px" p="sm">
      {options.map(option => {
        return (
          <NavLink
            key={option.id}
            icon={<Icon c="var(--mb-color-icon-primary)" name="table" />}
            label={option.display_name}
            onClick={() => {
              onClick(option);
            }}
            variant="default"
          />
        );
      })}
    </Paper>
  );
}
