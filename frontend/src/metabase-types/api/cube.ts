export interface CubeDataItem {
    name: string; 
    title: string;
    description: string;
    measures: {
        name: string;
        title: string;
        description: string;
        type: string;
        aggType: string;
        isVisible: boolean;
        public: boolean;
    }[];
    dimensions: {
        name: string;
        title: string;
        type: string;
        description: string;
        isVisible: boolean;
        public: boolean;
        primaryKey?: boolean;
    }[];
  }
  
  export interface CubeDataResponse {
    cubes: CubeDataItem[];
  }
  
  export interface CubeStatusResponse {
    projectName: string;
    token: string;
    status: string;
    apiUrl: string;
  }

  export type GetCubeDataRequest = {
    projectName: string;
  };
  
  export type UpdateCubeDataRequest = {
    payload: {
        cubeFiles: {
            model: {
                cubes: CubeDataItem[];
            };
        };
    };
    companyName: string;
};

// New type for the /register request payload
export type RegisterCubeRequest = {
    projectName: string;
    dockerfile: string;
    dockerContextPath: string;
    customGitUrl: string;
    customGitBranch: string;
    customGitBuildPath: string;
    apiUrl: string;
    token: string;
    apiPort: number;
}

// New type for the /deploy request payload
export type DeployCubeRequest = {
    companyName: string;
}
  
