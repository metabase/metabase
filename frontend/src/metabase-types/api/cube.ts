export interface CubeDataItem {
    fileName: string;
    content: unknown;
  }
  
export  type CubeDataResponse = CubeDataItem[];
  
export interface GetCubeDataRequest {
    projectName: string;
    [key: string]: unknown; // For any additional params
  }

  export type UpdateCubeDataRequest = {
    company_name: string;
    payload: {
        cubeFiles: {
            model: {
                cubes: Record<string, string>;
            };
        };
    };
};
