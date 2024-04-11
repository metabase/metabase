import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const FontWrapper = styled.div<{ baseUrl?: string }>`
  ${({ baseUrl = "" }) => css`
    /* lato-regular - latin */
    @font-face {
      font-family: Lato;
      font-style: normal;
      font-weight: 400;
      src: url("${baseUrl}/app/fonts/Lato/lato-v16-latin-regular.eot"); /* IE9 Compat Modes */
      src: local("Lato Regular"), local("Lato-Regular"),
        url("${baseUrl}/app/fonts/Lato/lato-v16-latin-regular.eot?#iefix")
          format("embedded-opentype"),
        /* IE6-IE8 */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-regular.woff2")
          format("woff2"),
        /* Super Modern Browsers */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-regular.woff")
          format("woff"),
        /* Modern Browsers */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-regular.ttf")
          format("truetype"),
        /* Safari, Android, iOS */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-regular.svg#Lato")
          format("svg"); /* Legacy iOS */
    }

    /* lato-700 - latin */
    @font-face {
      font-family: Lato;
      font-style: normal;
      font-weight: 700;
      src: url("${baseUrl}/app/fonts/Lato/lato-v16-latin-700.eot"); /* IE9 Compat Modes */
      src: local("Lato Bold"), local("Lato-Bold"),
        url("${baseUrl}/app/fonts/Lato/lato-v16-latin-700.eot?#iefix")
          format("embedded-opentype"),
        /* IE6-IE8 */ url("${baseUrl}/app/fonts/Lato/lato-v16-latin-700.woff2")
          format("woff2"),
        /* Super Modern Browsers */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-700.woff")
          format("woff"),
        /* Modern Browsers */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-700.ttf")
          format("truetype"),
        /* Safari, Android, iOS */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-700.svg#Lato")
          format("svg"); /* Legacy iOS */
    }

    /* lato-900 - latin */
    @font-face {
      font-family: Lato;
      font-style: normal;
      font-weight: 900;
      src: url("${baseUrl}/app/fonts/Lato/lato-v16-latin-900.eot"); /* IE9 Compat Modes */
      src: local("Lato Black"), local("Lato-Black"),
        url("${baseUrl}/app/fonts/Lato/lato-v16-latin-900.eot?#iefix")
          format("embedded-opentype"),
        /* IE6-IE8 */ url("${baseUrl}/app/fonts/Lato/lato-v16-latin-900.woff2")
          format("woff2"),
        /* Super Modern Browsers */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-900.woff")
          format("woff"),
        /* Modern Browsers */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-900.ttf")
          format("truetype"),
        /* Safari, Android, iOS */
          url("${baseUrl}/app/fonts/Lato/lato-v16-latin-900.svg#Lato")
          format("svg"); /* Legacy iOS */
    }

    /* PT Serif 400 */
    @font-face {
      font-family: "PT Serif";
      src: local("PT Serif"), local("PTSerif-Regular"),
        url("${baseUrl}/app/fonts/PT_Serif/PTSerif-Regular.woff2")
          format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    /* PT Serif 700 */
    @font-face {
      font-family: "PT Serif";
      src: local("PT Serif Bold"), local("PTSerif-Bold"),
        url("${baseUrl}/app/fonts/PT_Serif/PTSerif-Bold.woff2") format("woff2");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    /* Merriweather-400 */
    @font-face {
      font-family: Merriweather;
      src: local("Merriweather Regular"), local("Merriweather-Regular"),
        url("${baseUrl}/app/fonts/Merriweather/Merriweather-Regular.woff2")
          format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    /* Merriweather-700 */
    @font-face {
      font-family: Merriweather;
      src: local("Merriweather Bold"), local("Merriweather-Bold"),
        url("${baseUrl}/app/fonts/Merriweather/Merriweather-Bold.woff2")
          format("woff2");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    /* Merriweather-400 */
    @font-face {
      font-family: Merriweather;
      src: local("Merriweather Black"), local("Merriweather-Black"),
        url("${baseUrl}/app/fonts/Merriweather/Merriweather-Black.woff2")
          format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Montserrat;
      src: local("Montserrat Regular"), local("Montserrat-Regular"),
        url("${baseUrl}/app/fonts/Montserrat/Montserrat-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Montserrat;
      src: local("Montserrat Bold"), local("Montserrat-Bold"),
        url("${baseUrl}/app/fonts/Montserrat/Montserrat-Bold.woff2")
          format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Montserrat;
      src: local("Montserrat Black"), local("Montserrat-Black"),
        url("${baseUrl}/app/fonts/Montserrat/Montserrat-Black.woff2")
          format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Open Sans";
      src: local("Open Sans Regular"), local("OpenSans-Regular"),
        url("${baseUrl}/app/fonts/Open_Sans/OpenSans-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Open Sans";
      src: local("Open Sans Bold"), local("OpenSans-Bold"),
        url("${baseUrl}/app/fonts/Open_Sans/OpenSans-Bold.woff2")
          format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Oswald;
      src: local("Oswald Bold"), local("Oswald-Bold"),
        url("${baseUrl}/app/fonts/Oswald/Oswald-Bold.woff2") format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Oswald;
      src: local("Oswald Regular"), local("Oswald-Regular"),
        url("${baseUrl}/app/fonts/Oswald/Oswald-Regular.woff2") format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Raleway;
      src: local("Raleway Bold"), local("Raleway-Bold"),
        url("${baseUrl}/app/fonts/Raleway/Raleway-Bold.woff2") format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Raleway;
      src: local("Raleway Regular"), local("Raleway-Regular"),
        url("${baseUrl}/app/fonts/Raleway/Raleway-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Raleway;
      src: local("Raleway Black"), local("Raleway-Black"),
        url("${baseUrl}/app/fonts/Raleway/Raleway-Black.woff2") format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Roboto;
      src: local("Roboto Black"), local("Roboto-Black"),
        url("${baseUrl}/app/fonts/Roboto/Roboto-Black.woff2") format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Roboto;
      src: local("Roboto Bold"), local("Roboto-Bold"),
        url("${baseUrl}/app/fonts/Roboto/Roboto-Bold.woff2") format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Roboto;
      src: local("Roboto"), local("Roboto-Regular"),
        url("${baseUrl}/app/fonts/Roboto/Roboto-Regular.woff2") format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Roboto Condensed";
      src: local("Roboto Condensed Bold"), local("RobotoCondensed-Bold"),
        url("${baseUrl}/app/fonts/Roboto_Condensed/RobotoCondensed-Bold.woff2")
          format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Roboto Condensed";
      src: local("Roboto Condensed"), local("RobotoCondensed-Regular"),
        url("${baseUrl}/app/fonts/Roboto_Condensed/RobotoCondensed-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Slabo 27px";
      src: local("Slabo 27px"), local("Slabo27px-Regular"),
        url("${baseUrl}/app/fonts/Slabo_27px/Slabo27px-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Source Sans Pro";
      src: local("Source Sans Pro Black"), local("SourceSansPro-Black"),
        url("${baseUrl}/app/fonts/Source_Sans_Pro/SourceSansPro-Black.woff2")
          format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Source Sans Pro";
      src: local("Source Sans Pro"), local("SourceSansPro-Regular"),
        url("${baseUrl}/app/fonts/Source_Sans_Pro/SourceSansPro-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Source Sans Pro";
      src: local("Source Sans Pro Bold"), local("SourceSansPro-Bold"),
        url("${baseUrl}/app/fonts/Source_Sans_Pro/SourceSansPro-Bold.woff2")
          format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Lora;
      src: local("Lora Bold"), local("Lora-Bold"),
        url("${baseUrl}/app/fonts/Lora/Lora-Bold.woff2") format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Lora;
      src: local("Lora Regular"), local("Lora-Regular"),
        url("${baseUrl}/app/fonts/Lora/Lora-Regular.woff2") format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Noto Sans";
      src: local("Noto Sans Black"), local("NotoSans-Black"),
        url("${baseUrl}/app/fonts/Noto_Sans/NotoSans-Black.woff2")
          format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Noto Sans";
      src: local("Noto Sans Regular"), local("NotoSans-Regular"),
        url("${baseUrl}/app/fonts/Noto_Sans/NotoSans-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Noto Sans";
      src: local("Noto Sans Bold"), local("NotoSans-Bold"),
        url("${baseUrl}/app/fonts/Noto_Sans/NotoSans-Bold.woff2")
          format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Playfair Display";
      src: local("Playfair Display Regular"), local("PlayfairDisplay-Regular"),
        url("${baseUrl}/app/fonts/Playfair_Display/PlayfairDisplay-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Playfair Display";
      src: local("Playfair Display Bold"), local("PlayfairDisplay-Bold"),
        url("${baseUrl}/app/fonts/Playfair_Display/PlayfairDisplay-Bold.woff2")
          format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Playfair Display";
      src: local("Playfair Display Black"), local("PlayfairDisplay-Black"),
        url("${baseUrl}/app/fonts/Playfair_Display/PlayfairDisplay-Black.woff2")
          format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Poppins;
      src: local("Poppins Bold"), local("Poppins-Bold"),
        url("${baseUrl}/app/fonts/Poppins/Poppins-Bold.woff2") format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Poppins;
      src: local("Poppins Regular"), local("Poppins-Regular"),
        url("${baseUrl}/app/fonts/Poppins/Poppins-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Poppins;
      src: local("Poppins Black"), local("Poppins-Black"),
        url("${baseUrl}/app/fonts/Poppins/Poppins-Black.woff2") format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "PT Sans";
      src: local("PT Sans"), local("PTSans-Regular"),
        url("${baseUrl}/app/fonts/PT_Sans/PTSans-Regular.woff2") format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "PT Sans";
      src: local("PT Sans Bold"), local("PTSans-Bold"),
        url("${baseUrl}/app/fonts/PT_Sans/PTSans-Bold.woff2") format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Roboto Mono";
      src: local("Roboto Mono Bold"), local("RobotoMono-Bold"),
        url("${baseUrl}/app/fonts/Roboto_Mono/RobotoMono-Bold.woff2")
          format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Roboto Mono";
      src: local("Roboto Mono Regular"), local("RobotoMono-Regular"),
        url("${baseUrl}/app/fonts/Roboto_Mono/RobotoMono-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Roboto Slab";
      src: local("Roboto Slab Black"), local("RobotoSlab-Black"),
        url("${baseUrl}/app/fonts/Roboto_Slab/RobotoSlab-Black.woff2")
          format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Roboto Slab";
      src: local("Roboto Slab Regular"), local("RobotoSlab-Regular"),
        url("${baseUrl}/app/fonts/Roboto_Slab/RobotoSlab-Regular.woff2")
          format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Roboto Slab";
      src: local("Roboto Slab Bold"), local("RobotoSlab-Bold"),
        url("${baseUrl}/app/fonts/Roboto_Slab/RobotoSlab-Bold.woff2")
          format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Ubuntu;
      src: local("Ubuntu Bold"), local("Ubuntu-Bold"),
        url("${baseUrl}/app/fonts/Ubuntu/Ubuntu-Bold.woff2") format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Ubuntu;
      src: local("Ubuntu Regular"), local("Ubuntu-Regular"),
        url("${baseUrl}/app/fonts/Ubuntu/Ubuntu-Regular.woff2") format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Inter;
      src: local("Inter Regular"), local("Inter-Regular"),
        url("${baseUrl}/app/fonts/Inter/Inter-Regular.woff2") format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Inter;
      src: local("Inter Bold"), local("Inter-Bold"),
        url("${baseUrl}/app/fonts/Inter/Inter-Bold.woff2") format("woff2");
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Inter;
      src: local("Inter Black"), local("Inter-Black"),
        url("${baseUrl}/app/fonts/Inter/Inter-Black.woff2") format("woff2");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }
  `}
`;
