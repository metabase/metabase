export interface AppErrorDescriptor {
  status: number;
  data?: {
    error_code: string;
    message?: string;
  };
  context?: string;
}

export interface AppState {
  errorPage: AppErrorDescriptor | null;
  isNavbarOpen: boolean;
}
