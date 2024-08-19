export interface CubeDataItem {
    fileName: string;
    content: string;
  }
  
export  type CubeDataResponse = CubeDataItem[];
  
export interface GetCubeDataRequest {
    projectName: string;
    [key: string]: unknown; // For any additional params
  }

  export type UpdateCubeDataRequest = {
    payload: {
        cubeFiles: {
            model: {
                cubes: Record<string, string>;
            };
        };
    };
};
