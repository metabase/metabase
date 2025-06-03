import {
  type ApplicationConfig,
  provideZoneChangeDetection,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";

import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
  ],
};

export const metabaseProviderAuthConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: `http://localhost:${process.env.NG_APP_MB_PORT}`,
});
