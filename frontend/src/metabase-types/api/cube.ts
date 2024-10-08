export interface CubeDataItem {
    fileName: string;
    content: string;
}

export type CubeDataResponse = CubeDataItem[];

export type GetCubeDataRequest = {
    companyName: string;
}

export type UpdateCubeDataRequest = {
    payload: {
        cubeFiles: {
            model: {
                cubes: Record<string, string>;
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
