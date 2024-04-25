import { css } from "@emotion/react";

export const defaultFontFiles = ({ baseUrl = "./" } = {}) => {
  const localInstanceUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const basePath = `${localInstanceUrl}app/fonts`;

  return css`
      /* lato-regular - latin */
      @font-face {
        font-family: Lato;
        font-style: normal;
        font-weight: 400;
        src: url("${basePath}/Lato/lato-v16-latin-regular.eot"); /* IE9 Compat Modes */
        src: local("Lato Regular"), local("Lato-Regular"),
        url("${basePath}/Lato/lato-v16-latin-regular.eot?#iefix") format("embedded-opentype"),
          /* IE6-IE8 */ url("${basePath}/Lato/lato-v16-latin-regular.woff2") format("woff2"),
          /* Super Modern Browsers */ url("${basePath}/Lato/lato-v16-latin-regular.woff") format("woff"),
          /* Modern Browsers */ url("${basePath}/Lato/lato-v16-latin-regular.ttf") format("truetype"),
          /* Safari, Android, iOS */ url("${basePath}/Lato/lato-v16-latin-regular.svg#Lato") format("svg"); /* Legacy iOS */
      }

      /* lato-700 - latin */
      @font-face {
        font-family: Lato;
        font-style: normal;
        font-weight: 700;
        src: url("${basePath}/Lato/lato-v16-latin-700.eot"); /* IE9 Compat Modes */
        src: local("Lato Bold"), local("Lato-Bold"),
        url("${basePath}/Lato/lato-v16-latin-700.eot?#iefix") format("embedded-opentype"),
          /* IE6-IE8 */ url("${basePath}/Lato/lato-v16-latin-700.woff2") format("woff2"),
          /* Super Modern Browsers */ url("${basePath}/Lato/lato-v16-latin-700.woff") format("woff"),
          /* Modern Browsers */ url("${basePath}/Lato/lato-v16-latin-700.ttf") format("truetype"),
          /* Safari, Android, iOS */ url("${basePath}/Lato/lato-v16-latin-700.svg#Lato") format("svg"); /* Legacy iOS */
      }

      /* lato-900 - latin */
      @font-face {
        font-family: Lato;
        font-style: normal;
        font-weight: 900;
        src: url("${basePath}/Lato/lato-v16-latin-900.eot"); /* IE9 Compat Modes */
        src: local("Lato Black"), local("Lato-Black"),
        url("${basePath}/Lato/lato-v16-latin-900.eot?#iefix") format("embedded-opentype"),
          /* IE6-IE8 */ url("${basePath}/Lato/lato-v16-latin-900.woff2") format("woff2"),
          /* Super Modern Browsers */ url("${basePath}/Lato/lato-v16-latin-900.woff") format("woff"),
          /* Modern Browsers */ url("${basePath}/Lato/lato-v16-latin-900.ttf") format("truetype"),
          /* Safari, Android, iOS */ url("${basePath}/Lato/lato-v16-latin-900.svg#Lato") format("svg"); /* Legacy iOS */
      }

      /* PT Serif 400 */
      @font-face {
        font-family: "PT Serif";
        src: local("PT Serif"), local("PTSerif-Regular"),
        url("${basePath}/PT_Serif/PTSerif-Regular.woff2") format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      /* PT Serif 700 */
      @font-face {
        font-family: "PT Serif";
        src: local("PT Serif Bold"), local("PTSerif-Bold"),
        url("${basePath}/PT_Serif/PTSerif-Bold.woff2") format("woff2");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }

      /* Merriweather-400 */
      @font-face {
        font-family: Merriweather;
        src: local("Merriweather Regular"), local("Merriweather-Regular"),
        url("${basePath}/Merriweather/Merriweather-Regular.woff2") format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      /* Merriweather-700 */
      @font-face {
        font-family: Merriweather;
        src: local("Merriweather Bold"), local("Merriweather-Bold"),
        url("${basePath}/Merriweather/Merriweather-Bold.woff2") format("woff2");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }

      /* Merriweather-400 */
      @font-face {
        font-family: Merriweather;
        src: local("Merriweather Black"), local("Merriweather-Black"),
        url("${basePath}/Merriweather/Merriweather-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Montserrat;
        src: local("Montserrat Regular"), local("Montserrat-Regular"),
        url("${basePath}/Montserrat/Montserrat-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Montserrat;
        src: local("Montserrat Bold"), local("Montserrat-Bold"),
        url("${basePath}/Montserrat/Montserrat-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Montserrat;
        src: local("Montserrat Black"), local("Montserrat-Black"),
        url("${basePath}/Montserrat/Montserrat-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Open Sans";
        src: local("Open Sans Regular"), local("OpenSans-Regular"),
        url("${basePath}/Open_Sans/OpenSans-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Open Sans";
        src: local("Open Sans Bold"), local("OpenSans-Bold"),
        url("${basePath}/Open_Sans/OpenSans-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Oswald;
        src: local("Oswald Bold"), local("Oswald-Bold"),
        url("${basePath}/Oswald/Oswald-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Oswald;
        src: local("Oswald Regular"), local("Oswald-Regular"),
        url("${basePath}/Oswald/Oswald-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Raleway;
        src: local("Raleway Bold"), local("Raleway-Bold"),
        url("${basePath}/Raleway/Raleway-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Raleway;
        src: local("Raleway Regular"), local("Raleway-Regular"),
        url("${basePath}/Raleway/Raleway-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Raleway;
        src: local("Raleway Black"), local("Raleway-Black"),
        url("${basePath}/Raleway/Raleway-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Roboto;
        src: local("Roboto Black"), local("Roboto-Black"),
        url("${basePath}/Roboto/Roboto-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Roboto;
        src: local("Roboto Bold"), local("Roboto-Bold"),
        url("${basePath}/Roboto/Roboto-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Roboto;
        src: local("Roboto"), local("Roboto-Regular"),
        url("${basePath}/Roboto/Roboto-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Roboto Condensed";
        src: local("Roboto Condensed Bold"), local("RobotoCondensed-Bold"),
        url("${basePath}/Roboto_Condensed/RobotoCondensed-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Roboto Condensed";
        src: local("Roboto Condensed"), local("RobotoCondensed-Regular"),
        url("${basePath}/Roboto_Condensed/RobotoCondensed-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Slabo 27px";
        src: local("Slabo 27px"), local("Slabo27px-Regular"),
        url("${basePath}/Slabo_27px/Slabo27px-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Source Sans Pro";
        src: local("Source Sans Pro Black"), local("SourceSansPro-Black"),
        url("${basePath}/Source_Sans_Pro/SourceSansPro-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Source Sans Pro";
        src: local("Source Sans Pro"), local("SourceSansPro-Regular"),
        url("${basePath}/Source_Sans_Pro/SourceSansPro-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Source Sans Pro";
        src: local("Source Sans Pro Bold"), local("SourceSansPro-Bold"),
        url("${basePath}/Source_Sans_Pro/SourceSansPro-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Lora;
        src: local("Lora Bold"), local("Lora-Bold"),
        url("${basePath}/Lora/Lora-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Lora;
        src: local("Lora Regular"), local("Lora-Regular"),
        url("${basePath}/Lora/Lora-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Noto Sans";
        src: local("Noto Sans Black"), local("NotoSans-Black"),
        url("${basePath}/Noto_Sans/NotoSans-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Noto Sans";
        src: local("Noto Sans Regular"), local("NotoSans-Regular"),
        url("${basePath}/Noto_Sans/NotoSans-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Noto Sans";
        src: local("Noto Sans Bold"), local("NotoSans-Bold"),
        url("${basePath}/Noto_Sans/NotoSans-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Playfair Display";
        src: local("Playfair Display Regular"), local("PlayfairDisplay-Regular"),
        url("${basePath}/Playfair_Display/PlayfairDisplay-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Playfair Display";
        src: local("Playfair Display Bold"), local("PlayfairDisplay-Bold"),
        url("${basePath}/Playfair_Display/PlayfairDisplay-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Playfair Display";
        src: local("Playfair Display Black"), local("PlayfairDisplay-Black"),
        url("${basePath}/Playfair_Display/PlayfairDisplay-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Poppins;
        src: local("Poppins Bold"), local("Poppins-Bold"),
        url("${basePath}/Poppins/Poppins-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Poppins;
        src: local("Poppins Regular"), local("Poppins-Regular"),
        url("${basePath}/Poppins/Poppins-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Poppins;
        src: local("Poppins Black"), local("Poppins-Black"),
        url("${basePath}/Poppins/Poppins-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "PT Sans";
        src: local("PT Sans"), local("PTSans-Regular"),
        url("${basePath}/PT_Sans/PTSans-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "PT Sans";
        src: local("PT Sans Bold"), local("PTSans-Bold"),
        url("${basePath}/PT_Sans/PTSans-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Roboto Mono";
        src: local("Roboto Mono Bold"), local("RobotoMono-Bold"),
        url("${basePath}/Roboto_Mono/RobotoMono-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Roboto Mono";
        src: local("Roboto Mono Regular"), local("RobotoMono-Regular"),
        url("${basePath}/Roboto_Mono/RobotoMono-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Roboto Slab";
        src: local("Roboto Slab Black"), local("RobotoSlab-Black"),
        url("${basePath}/Roboto_Slab/RobotoSlab-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Roboto Slab";
        src: local("Roboto Slab Regular"), local("RobotoSlab-Regular"),
        url("${basePath}/Roboto_Slab/RobotoSlab-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Roboto Slab";
        src: local("Roboto Slab Bold"), local("RobotoSlab-Bold"),
        url("${basePath}/Roboto_Slab/RobotoSlab-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Ubuntu;
        src: local("Ubuntu Bold"), local("Ubuntu-Bold"),
        url("${basePath}/Ubuntu/Ubuntu-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Ubuntu;
        src: local("Ubuntu Regular"), local("Ubuntu-Regular"),
        url("${basePath}/Ubuntu/Ubuntu-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Inter;
        src: local("Inter Regular"), local("Inter-Regular"),
        url("${basePath}/Inter/Inter-Regular.woff2") format("woff2");
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Inter;
        src: local("Inter Bold"), local("Inter-Bold"),
        url("${basePath}/Inter/Inter-Bold.woff2") format("woff2");
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: Inter;
        src: local("Inter Black"), local("Inter-Black"),
        url("${basePath}/Inter/Inter-Black.woff2") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }
    }
    `;
};
