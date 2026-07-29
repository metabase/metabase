export interface CopyModalProps {
  entityType: string | undefined;
  entityObject: any;
  copy: (data: any) => Promise<any>;
  title?: string;
  onClose: () => void;
  onSaved: (newEntity?: any) => void;
  overwriteOnInitialValuesChange?: boolean;
  onValuesChange?: (values: any) => void;
}
