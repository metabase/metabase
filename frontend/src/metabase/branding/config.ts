/**
 * ALL Tecnologias — branding do fork do Metabase (AGPL).
 *
 * Nome e mensagens do frontend ficam aqui. As CORES e o nome usado no
 * backend (título da aba, e-mails) ficam em src/metabase/appearance/settings.clj.
 * Os arquivos de imagem ficam em:
 *   resources/frontend_client/app/assets/img/all-logo.svg   (logo da barra superior)
 *   resources/frontend_client/app/assets/img/favicon.ico    (ícone da aba)
 *   resources/frontend_client/app/assets/img/email_logo.png (logo dos e-mails)
 */
import logoUrl from "assets/img/all-logo.svg";

interface BrandConfig {
  name: string;
  logoUrl: string;
  loadingMessage: string;
  slowLoadingMessage: string;
  showMetabaseLinks: boolean;
}

export const BRAND: BrandConfig = {
  /** Substitui a palavra "Metabase" em toda a interface. */
  name: "B.I ALL Tecnologias",

  /** URL do logo (importado pelo bundler). */
  logoUrl,

  /** Mensagens exibidas enquanto uma consulta roda. */
  loadingMessage: "Carregando dados...",
  slowLoadingMessage: "Aguardando resultados...",

  /** Esconde links para metabase.com (docs, ajuda, upsells) fora do admin. */
  showMetabaseLinks: false,
};
