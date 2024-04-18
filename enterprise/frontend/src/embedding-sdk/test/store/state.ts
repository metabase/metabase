import {
    AdminState,
    AppState,
    AuthState,
    DashboardState,
    EmbedState,
    EntitiesState,
    MetabotState, QueryBuilderState, RequestsState, SettingsState, SetupState
} from "metabase-types/store";
import {User} from "metabase-types/api";
import {ParametersState} from "metabase-types/store/parameters";
import {RouterState} from "react-router-redux";
import {FileUploadState} from "metabase-types/store/upload";
import {EmbeddingSessionTokenState} from "embedding-sdk/store/types";

export interface State {
    admin: AdminState;
    app: AppState;
    auth: AuthState;
    currentUser: User | null;
    dashboard: DashboardState;
    embed: EmbedState;
    entities: EntitiesState;
    metabot: MetabotState;
    parameters: ParametersState;
    qb: QueryBuilderState;
    requests: RequestsState;
    routing: RouterState;
    settings: SettingsState;
    setup: SetupState;
    upload: FileUploadState;
    modal: modalName;
    embeddingSessionToken: EmbeddingSessionTokenState;
}