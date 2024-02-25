local cmd = vim.cmd
local g = vim.g
local opt = vim.opt
local keyset = vim.keymap.set

local home = os.getenv('HOME')
package.path = package.path .. ';' .. home .. '/.config/nvim/lua/?.lua'

local status_ok, err = pcall(require, "early_bindings")
if not status_ok then
  print("Error loading early_bindings.lua: " .. err)
end

g.python3_host_prog="/opt/homebrew/bin/python3.12"

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- plugins to try
-- Noah recommends
-- - the fzf GitFiles thing
-- - switching esc/caps lock to facilitate vim
-- - remap right command key to ctrl
-- Sloan recommends:
-- - ripgrep for file finding
-- - https://github.com/ThePrimeagen/harpoon
-- - instead of MRU, maybe telescope builtin oldfiles
-- - telescope git status

-- for debugging, this function prints a table
-- example: `print(dump(var))~
function dump(o)
  if type(o) == 'table' then
    local s = '{ '
    for k,v in pairs(o) do
      if type(k) ~= 'number' then k = '"'..k..'"' end
      s = s .. '['..k..'] = ' .. dump(v) .. ','
    end
    return s .. '} '
  else
    return tostring(o)
  end
end

-- temporarily so I can figure out why I am losing work
--opt.verbosefile=~/.log/vim/verbose.log
--opt.verbose=15

g.mapleader = ","

disabled_plugins = { }

-- If there are plugins here, they will be the only enabled ones.
enable_just_these_plugins = {
}

plugins = {}

-- This allows us to modify all the plugins before we load them.
local function add(plugin)
  if type(plugin) == "string" then
    plugin = { plugin }
  end
  if vim.tbl_contains(disabled_plugins, plugin[1]) then
    print('disabling plugin: ' .. plugin[1])
    plugin.enabled = false
    return
  end
  if #enable_just_these_plugins == 0 or vim.tbl_contains(enable_just_these_plugins, plugin[1]) then
    table.insert(plugins, plugin)
  end
end

add 'abeldekat/lazyflex.nvim'
add 'SmiteshP/nvim-gps'

add 'styled-components/vim-styled-components'
add {'echasnovski/mini.nvim',
  config = function()
    require('mini.ai').setup()
    require('mini.bracketed').setup()
  end
}

add {
  "pmizio/typescript-tools.nvim",
  requires = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
  config = function()
    require("typescript-tools").setup {}
    keyset("n", "<leader>rui", ":TSToolsRemoveUnusedImports<CR>", {silent = true})
  end,
}

add {'kdheepak/lazygit.nvim',
  dependencies = {
    "nvim-telescope/telescope.nvim",
    "nvim-lua/plenary.nvim",
  },
  config = function ()
    keyset("n", "3g", ":LazyGit<CR>", {silent = true})
    keyset("n", "'g", ":LazyGit<CR>", {silent = true})
    require("telescope").load_extension("lazygit")
  end
}

-- shows error messages below the line rather than to the right
--- add {
---   "https://git.sr.ht/~whynothugo/lsp_lines.nvim",
---   config = function()
---     require("lsp_lines").setup()
---   end
--- }

-- if this is commented out it might be installed via vimrc
-- add {'prettier/vim-prettier',
--   build = 'yarn install',
--   ft = {'javascript', 'php', 'java', 'typescript', 'css', 'less', 'scss', 'json', 'markdown', 'yaml', 'html', 'svelte', 'typescriptreact', 'javascriptreact'},
--   config = function()
--     keyset("n", ",p", ":Prettier<CR>", {silent = true})
--   end
-- }


------------------------------------------------------------------------------
-- The problem with nvim-dap might be related to the fact that when I print
-- the `dap` variable I see `vimspector_setup` which should not be there. So
-- where is that string from? So strange. It doesn't come up when I ack for that
-- string in the lazy directory of plugins
------------------------------------------------------------------------------

------ add {
------   'mfussenegger/nvim-dap',
------   dependencies = {
------     -- Creates a beautiful debugger UI
------     'rcarriga/nvim-dap-ui',
------
------     -- Installs the debug adapters for you
------     'williamboman/mason.nvim',
------     'jay-babu/mason-nvim-dap.nvim',
------
------     -- Add your own debuggers here
------     --'leoluz/nvim-dap-go',
------     --'mfussenegger/nvim-dap-python',
------   },
------   config = function()
------
------     local dap = require 'dap'
------     dap.nvim_dap_setup()
------
------     local dapui = require 'dapui'
------
------     --require('dap-go').setup()
------     --require('dap-python').setup '~/.virtualenvs/debugpy/bin/python'
------
------     print('DAP')
------     print(dump(dap))
------     print('DAP LISTENERS')
------     print(dump(dap.listeners))
------
------     require('mason-nvim-dap').setup {
------       -- Makes a best effort to setup the various debuggers with
------       -- reasonable debug configurations
------       automatic_setup = true,
------
------       -- You'll need to check that you have the required things installed
------       -- online, please don't ask me how to install them :)
------       ensure_installed = {
------         -- Update this to ensure that you have the debuggers for the langs you want
------         'delve',
------         'debugpy',
------       },
------     }
------
------     -- You can provide additional configuration to the handlers,
------     -- see mason-nvim-dap README for more information
------     require('mason-nvim-dap').setup()
------
------     -- Dap UI setup
------     -- For more information, see |:help nvim-dap-ui|
------     dapui.setup {
------       -- Set icons to characters that are more likely to work in every terminal.
------       --    Feel free to remove or use ones that you like more! :)
------       --    Don't feel like these are good choices.
------       icons = { expanded = '▾', collapsed = '▸', current_frame = '*' },
------       controls = {
------         icons = {
------           pause = '⏸',
------           play = '▶',
------           step_into = '⏎',
------           step_over = '⏭',
------           step_out = '⏮',
------           step_back = 'b',
------           run_last = '▶▶',
------           terminate = '⏹',
------         },
------       },
------     }
------
------     dap.listeners.after.event_initialized['dapui_config'] = dapui.open
------     dap.listeners.before.event_terminated['dapui_config'] = dapui.close
------     dap.listeners.before.event_exited['dapui_config'] = dapui.close
------   end,
------ }

---- add {
----   "mfussenegger/nvim-dap",
----   enabled = true,
----   module = "dap",
----   opt = true,
----   event = "BufReadPre",
----   dependencies = {
----     "nvim-telescope/telescope-dap.nvim",
----     "mxsdev/nvim-dap-vscode-js",
----     {
----       "microsoft/vscode-js-debug",
----       opt = true,
----       build = "npm install --legacy-peer-deps && npx gulp vsDebugServerBundle && mv dist out"
----     },
----     'jay-babu/mason-nvim-dap.nvim',
----     -- let's comment out some of these dependencies and see what happens
----     "rcarriga/nvim-dap-ui",
----     "Pocco81/DAPInstall.nvim",
----     "theHamsta/nvim-dap-virtual-text",
----     "mfussenegger/nvim-dap-python",
----     ---- { "leoluz/nvim-dap-go", module = "dap-go" },
----     ---- { "jbyuki/one-small-step-for-vimkind", module = "osv" },
----     ---- "nvim-dap-virtual-text",
----     'nvim-telescope/telescope-dap.nvim',
----     ----"nvim-dap-ui",
----     "which-key.nvim"
----   },
----   config = function()
----     local dap = require 'dap'
----     local dapui = require 'dapui'
----
----     require("mason-nvim-dap").setup {
----       -- Makes a best effort to setup the various debuggers with
----       -- reasonable debug configurations
----       automatic_setup = true,
----
----       -- You'll need to check that you have the required things installed
----       -- online, please don't ask me how to install them :)
----       ensure_installed = {
----         "delve",
----         'debugpy',
----         'vscode-node-debug2',
----         'vscode-go',
----         'vscode-java-debug',
----         'vscode-cpptools',
----         'vscode-lua',
----         ------
----         -- Copilot added these, maybe they're real, maybe not:
----         --'vscode-python-test-adapter',
----         --'vscode-ruby-debugger',
----         --'vscode-php-debug',
----         --'vscode-php-debug-companion',
----         --'vscode-dotnet-debug',
----         --'vscode-elixir-debugging',
----         --'vscode-swift-debug',
----         --'vscode-chrome-debug',
----         --'vscode-edge-debug',
----         --'vscode-firefox-debug',
----         --'vscode-js-debug',
----         --'vscode-wsl-debug',
----         --'vscode-docker',
----       },
----     }
----     require('mason-nvim-dap').setup()
----     dapui.setup {
----       -- Set icons to characters that are more likely to work in every terminal.
----       --    Feel free to remove or use ones that you like more! :)
----       --    Don't feel like these are good choices.
----       icons = { expanded = '▾', collapsed = '▸', current_frame = '*' },
----       controls = {
----         icons = {
----           pause = '⏸',
----           play = '▶',
----           step_into = '⏎',
----           step_over = '⏭',
----           step_out = '⏮',
----           step_back = 'b',
----           run_last = '▶▶',
----           terminate = '⏹',
----         },
----       },
----     }
----     dap.listeners.after.event_initialized['dapui_config'] = dapui.open
----     dap.listeners.before.event_terminated['dapui_config'] = dapui.close
----     dap.listeners.before.event_exited['dapui_config'] = dapui.close
----
----     keyset('n', '<leader>dc', ':lua require"dap".continue()<CR>')
----     keyset('n', '<leader>dsv', ':lua require"dap".step_over()<CR>')
----     keyset('n', '<leader>dsi', ':lua require"dap".step_into()<CR>')
----     keyset('n', '<leader>dso', ':lua require"dap".step_out()<CR>')
----     keyset('n', '<leader>dtb', ':lua require"dap".toggle_breakpoint()<CR>')
----     keyset('n', '<leader>dsbr', ':lua require"dap".set_breakpoint(vim.fn.input("Breakpoint condition: "))<CR>')
----     keyset('n', '<leader>dsbm', ':lua require"dap".set_breakpoint(nil, nil, vim.fn.input("Log point message: "))<CR>')
----     keyset('n', '<leader>dro', ':lua require"dap".repl.open()<CR>')
----     keyset('n', '<leader>drl', ':lua require"dap".repl.run_last()<CR>')
----     --- keyset('n', '<leader>dcc', ':lua require"telescope".extensions.dap.commands{}<CR>')
----     --- keyset('n', '<leader>dco', ':lua require"telescope".extensions.dap.configurations{}<CR>')
----     --- keyset('n', '<leader>dlb', ':lua require"telescope".extensions.dap.list_breakpoints{}<CR>')
----     --- keyset('n', '<leader>dv', ':lua require"telescope".extensions.dap.variables{}<CR>')
----     --- keyset('n', '<leader>df', ':lua require"telescope".extensions.dap.frames{}<CR>')
----
----     require "dap-vscode-js".setup({
----         adapters = { 'pwa-chrome' },
----         log_file_path = "/tmp/dap_vscode_js.log",
----         log_file_level = vim.log.levels.INFO,
----         log_console_level = vim.log.levels.INFO
----       })
----       for _, language in ipairs({ "typescript", "javascript", "typescriptreact", "javascriptreact" }) do
----         require("dap").configurations[language] = {
----           {
----             type = "pwa-chrome",
----             request = "launch",
----             name = "Chrome Launch",
----           },
----         }
----      end
----
----   end,
---- }


add {"dense-analysis/neural",
  dependencies = {'MunifTanjim/nui.nvim', 'ElPiloto/significant.nvim'},
  config = function ()
    require('neural').setup({
      ui = {
          animated_sign_enabled = false,
      },
        source = {
          openai = {
            api_key = vim.env.OPENAI_API_KEY,
          },
        },
      })
  end
}
add {"psf/black",
  enabled = false,
  config =  function()
    vim.cmd([[
      autocmd BufWritePre *.py execute ':Black'
    ]])
  end
}


add { "SirVer/ultisnips" }

add { "junegunn/fzf" }
add { "junegunn/fzf.vim" }

add { "rebelot/heirline.nvim" }
add { "ggandor/leap.nvim",
  config =  function()
    require('leap').add_default_mappings()
  end
}

-- add { "aduros/ai.vim",
--   config =  function()
--     vim.g.ai_no_mappings = true
--     vim.cmd([[
--       map <silent> ;;; :AI
--       ]])
--   end
-- }

add { 'bkad/CamelCaseMotion',
  config = function()
    vim.cmd([[
      map <silent> W <Plug>CamelCaseMotion_w
      map <silent> B <Plug>CamelCaseMotion_b
      map <silent> E <Plug>CamelCaseMotion_e
      map <silent> gE <Plug>CamelCaseMotion_ge
      ]])
  end
}
--add { "embear/vim-localvimrc" }
add {"sainnhe/everforest"}
add { "williamboman/mason.nvim" }
add { "lewis6991/impatient.nvim", config = function () require("impatient") end}
--add 'mg979/vim-visual-multi'
add "TimUntersberger/neogit"
add "sindrets/diffview.nvim"
add { "yegappan/mru" }
add "vim-test/vim-test"
-- commenting in case this fixes .sh files
--add "nathom/filetype.nvim"
add "sheerun/vim-polyglot"
add {
  'heavenshell/vim-jsdoc',
  ft = { 'javascript', 'javascript.jsx', 'typescript' },
  build = 'make install'
}
add "LinArcX/telescope-command-palette.nvim"

add "ms-jpq/coq_nvim"
add {"stevearc/oil.nvim",
  config = function()
    require("oil").setup()
  end
}

add {
  "robitx/gp.nvim",
  enabled = true,
  config = function()
    require("gp").setup({
        agents = {
          -- {
          --   name = "ChatGPT3-5",
          -- },
          {
            name = "ChatGPT4",
            chat = true,
            command = true,
            -- string with model name or table with model name and parameters
            model = { model = "gpt-4-1106-preview", temperature = 1.1, top_p = 1 },
            -- system prompt (use this to specify the persona/role of the AI)
            system_prompt = "You are a general AI assistant.\n\n"
            .. "The user provided additional info about how they would like you to respond:\n\n"
            .. "- If you're unsure don't guess and say you don't know instead.\n"
            --.. "- Ask question if you need clarification to provide better answer.\n"
            --.. "- Think deeply and carefully from first principles step by step.\n"
            --.. "- Zoom out first to see the big picture and then zoom in to details.\n"
            --.. "- Use Socratic method to improve your thinking and coding skills.\n"
            .. "- if the answer requires coding: don't elide any code from your output; assume that I have already installed any relevant software; and unless I ask otherwise, give me the code first before explaining.\n"
            .. "- Take a deep breath; You've got this!\n"
            --.. "- If I ask for a bibliography citation, it should be formatted in yaml like this:\n"
            --.. "entries:\n- author:\n- last: Solère\nfirst: Jean-Luc\ntype: article\ntitle: The Question of <<Intensive Magnitudes>> According to Some Jesuits\njournal: The Monist\nyear: 2001\nvolume: 84\nissue: 4\npages: 582--616\nid: solere2001\n"
            --.. "Supply an id based on the last name and year. Do NOT include an ISBN or DOI in the yaml.\n"
            --.. "If the title is more than four words long, find a good substring to serve as a short title, and put it in angle brackets as shown above\n"
            --.. "If the best short title is not a substring of the title, add the short title as a separate field like this:\n"
            --.. "- author:\n- last: Alquie\nfirst: Ferdinand\ntitle: Le rationalisme de Spinoza\nshortTitle: \\emph{Rationalisme}\n"
            --.. "If the title includes a colon, wrap the title in double quotes\n"
          }
        }
      }
      )

    -- VISUAL mode mappings
    -- s, x, v modes are handled the same way by which_key
    require("which-key").register({
        -- ...
        ["<C-g>"] = {
          c = { ":<C-u>'<,'>GpChatNew<cr>", "Visual Chat New" },
          p = { ":<C-u>'<,'>GpChatPaste<cr>", "Visual Chat Paste" },
          t = { ":<C-u>'<,'>GpChatToggle<cr>", "Visual Toggle Chat" },

          ["<C-x>"] = { ":<C-u>'<,'>GpChatNew split<cr>", "Visual Chat New split" },
          ["<C-v>"] = { ":<C-u>'<,'>GpChatNew vsplit<cr>", "Visual Chat New vsplit" },
          ["<C-t>"] = { ":<C-u>'<,'>GpChatNew tabnew<cr>", "Visual Chat New tabnew" },

          r = { ":<C-u>'<,'>GpRewrite<cr>", "Visual Rewrite" },
          a = { ":<C-u>'<,'>GpAppend<cr>", "Visual Append (after)" },
          b = { ":<C-u>'<,'>GpPrepend<cr>", "Visual Prepend (before)" },
          i = { ":<C-u>'<,'>GpImplement<cr>", "Implement selection" },

          g = {
            name = "generate into new ..",
            p = { ":<C-u>'<,'>GpPopup<cr>", "Visual Popup" },
            e = { ":<C-u>'<,'>GpEnew<cr>", "Visual GpEnew" },
            n = { ":<C-u>'<,'>GpNew<cr>", "Visual GpNew" },
            v = { ":<C-u>'<,'>GpVnew<cr>", "Visual GpVnew" },
            t = { ":<C-u>'<,'>GpTabnew<cr>", "Visual GpTabnew" },
          },

          n = { "<cmd>GpNextAgent<cr>", "Next Agent" },
          s = { "<cmd>GpStop<cr>", "GpStop" },
          x = { ":<C-u>'<,'>GpContext<cr>", "Visual GpContext" },

          w = {
            name = "Whisper",
            w = { ":<C-u>'<,'>GpWhisper<cr>", "Whisper" },
            r = { ":<C-u>'<,'>GpWhisperRewrite<cr>", "Whisper Rewrite" },
            a = { ":<C-u>'<,'>GpWhisperAppend<cr>", "Whisper Append (after)" },
            b = { ":<C-u>'<,'>GpWhisperPrepend<cr>", "Whisper Prepend (before)" },
            p = { ":<C-u>'<,'>GpWhisperPopup<cr>", "Whisper Popup" },
            e = { ":<C-u>'<,'>GpWhisperEnew<cr>", "Whisper Enew" },
            n = { ":<C-u>'<,'>GpWhisperNew<cr>", "Whisper New" },
            v = { ":<C-u>'<,'>GpWhisperVnew<cr>", "Whisper Vnew" },
            t = { ":<C-u>'<,'>GpWhisperTabnew<cr>", "Whisper Tabnew" },
          },
        },
        -- ...
      }, {
        mode = "v", -- VISUAL mode
        prefix = "",
        buffer = nil,
        silent = true,
        noremap = true,
        nowait = true,
      })

    -- NORMAL mode mappings
    require("which-key").register({
        -- ...
        ["<C-g>"] = {
          c = { "<cmd>GpChatNew<cr>", "New Chat" },
          t = { "<cmd>GpChatToggle<cr>", "Toggle Chat" },
          f = { "<cmd>GpChatFinder<cr>", "Chat Finder" },

          ["<C-x>"] = { "<cmd>GpChatNew split<cr>", "New Chat split" },
          ["<C-v>"] = { "<cmd>GpChatNew vsplit<cr>", "New Chat vsplit" },
          ["<C-t>"] = { "<cmd>GpChatNew tabnew<cr>", "New Chat tabnew" },

          r = { "<cmd>GpRewrite<cr>", "Inline Rewrite" },
          a = { "<cmd>GpAppend<cr>", "Append (after)" },
          b = { "<cmd>GpPrepend<cr>", "Prepend (before)" },

          g = {
            name = "generate into new ..",
            p = { "<cmd>GpPopup<cr>", "Popup" },
            e = { "<cmd>GpEnew<cr>", "GpEnew" },
            n = { "<cmd>GpNew<cr>", "GpNew" },
            v = { "<cmd>GpVnew<cr>", "GpVnew" },
            t = { "<cmd>GpTabnew<cr>", "GpTabnew" },
          },

          n = { "<cmd>GpNextAgent<cr>", "Next Agent" },
          s = { "<cmd>GpStop<cr>", "GpStop" },
          x = { "<cmd>GpContext<cr>", "Toggle GpContext" },

          w = {
            name = "Whisper",
            w = { "<cmd>GpWhisper<cr>", "Whisper" },
            r = { "<cmd>GpWhisperRewrite<cr>", "Whisper Inline Rewrite" },
            a = { "<cmd>GpWhisperAppend<cr>", "Whisper Append (after)" },
            b = { "<cmd>GpWhisperPrepend<cr>", "Whisper Prepend (before)" },
            p = { "<cmd>GpWhisperPopup<cr>", "Whisper Popup" },
            e = { "<cmd>GpWhisperEnew<cr>", "Whisper Enew" },
            n = { "<cmd>GpWhisperNew<cr>", "Whisper New" },
            v = { "<cmd>GpWhisperVnew<cr>", "Whisper Vnew" },
            t = { "<cmd>GpWhisperTabnew<cr>", "Whisper Tabnew" },
          },
        },
        -- ...
      }, {
        mode = "n", -- NORMAL mode
        prefix = "",
        buffer = nil,
        silent = true,
        noremap = true,
        nowait = true,
      })

    -- INSERT mode mappings
    require("which-key").register({
        -- ...
        ["<C-g>"] = {
          c = { "<cmd>GpChatNew<cr>", "New Chat" },
          t = { "<cmd>GpChatToggle<cr>", "Toggle Chat" },
          f = { "<cmd>GpChatFinder<cr>", "Chat Finder" },

          ["<C-x>"] = { "<cmd>GpChatNew split<cr>", "New Chat split" },
          ["<C-v>"] = { "<cmd>GpChatNew vsplit<cr>", "New Chat vsplit" },
          ["<C-t>"] = { "<cmd>GpChatNew tabnew<cr>", "New Chat tabnew" },

          r = { "<cmd>GpRewrite<cr>", "Inline Rewrite" },
          a = { "<cmd>GpAppend<cr>", "Append (after)" },
          b = { "<cmd>GpPrepend<cr>", "Prepend (before)" },

          g = {
            name = "generate into new ..",
            p = { "<cmd>GpPopup<cr>", "Popup" },
            e = { "<cmd>GpEnew<cr>", "GpEnew" },
            n = { "<cmd>GpNew<cr>", "GpNew" },
            v = { "<cmd>GpVnew<cr>", "GpVnew" },
            t = { "<cmd>GpTabnew<cr>", "GpTabnew" },
          },

          x = { "<cmd>GpContext<cr>", "Toggle GpContext" },
          s = { "<cmd>GpStop<cr>", "GpStop" },
          n = { "<cmd>GpNextAgent<cr>", "Next Agent" },

          w = {
            name = "Whisper",
            w = { "<cmd>GpWhisper<cr>", "Whisper" },
            r = { "<cmd>GpWhisperRewrite<cr>", "Whisper Inline Rewrite" },
            a = { "<cmd>GpWhisperAppend<cr>", "Whisper Append (after)" },
            b = { "<cmd>GpWhisperPrepend<cr>", "Whisper Prepend (before)" },
            p = { "<cmd>GpWhisperPopup<cr>", "Whisper Popup" },
            e = { "<cmd>GpWhisperEnew<cr>", "Whisper Enew" },
            n = { "<cmd>GpWhisperNew<cr>", "Whisper New" },
            v = { "<cmd>GpWhisperVnew<cr>", "Whisper Vnew" },
            t = { "<cmd>GpWhisperTabnew<cr>", "Whisper Tabnew" },
          },
        },
        -- ...
      }, {
        mode = "i", -- INSERT mode
        prefix = "",
        buffer = nil,
        silent = true,
        noremap = true,
        nowait = true,
      })
	end,
}

add {
  "neoclide/coc.nvim",
  enabled = true,
  branch = "release",
  build = ":CocInstall coc-prettier<CR>",
  config = function ()

    vim.cmd("command! -nargs=0 Prettier :CocCommand prettier.forceFormatDocument")

    -- Some servers have issues with backup files, see #649
    vim.opt.backup = false
    vim.opt.writebackup = false

    -- Having longer updatetime (default is 4000 ms = 4s) leads to noticeable
    -- delays and poor user experience
    vim.opt.updatetime = 300

    -- Always show the signcolumn, otherwise it would shift the text each time
    -- diagnostics appeared/became resolved
    vim.opt.signcolumn = "yes"

    -- Autocomplete
    function _G.check_back_space()
      local col = vim.fn.col('.') - 1
      return col == 0 or vim.fn.getline('.'):sub(col, col):match('%s') ~= nil
    end

    -- Use Tab for trigger completion with characters ahead and navigate
    -- NOTE: There's always a completion item selected by default, you may want to enable
    -- no select by setting `"suggest.noselect": true` in your configuration file
    -- NOTE: Use command ':verbose imap <tab>' to make sure Tab is not mapped by
    -- other plugins before putting this into your config
    local opts = {silent = true, noremap = true, expr = true, replace_keycodes = false}
    keyset("i", "<TAB>", 'coc#pum#visible() ? coc#pum#next(1) : v:lua.check_back_space() ? "<TAB>" : coc#refresh()', opts)
    keyset("i", "<S-TAB>", [[coc#pum#visible() ? coc#pum#prev(1) : "\<C-h>"]], opts)

    -- Make <CR> to accept selected completion item or notify coc.nvim to format
    -- <C-g>u breaks current undo, please make your own choice
    keyset("i", "<cr>", [[coc#pum#visible() ? coc#pum#confirm() : "\<C-g>u\<CR>\<c-r>=coc#on_enter()\<CR>"]], opts)

    -- Use <c-j> to trigger snippets
    keyset("i", "<c-j>", "<Plug>(coc-snippets-expand-jump)")
    -- Use <c-space> to trigger completion
    keyset("i", "<c-space>", "coc#refresh()", {silent = true, expr = true})

    -- Use `[g` and `]g` to navigate diagnostics
    -- Use `:CocDiagnostics` to get all diagnostics of current buffer in location list
    keyset("n", "[g", "<Plug>(coc-diagnostic-prev)", {silent = true})
    keyset("n", "]g", "<Plug>(coc-diagnostic-next)", {silent = true})

    -- GoTo code navigation
    keyset("n", "gd", "<Plug>(coc-definition)", {silent = true})
    keyset("n", "gy", "<Plug>(coc-type-definition)", {silent = true})
    keyset("n", "gY", "<Plug>(coc-type-definition)", {silent = true})
    keyset("n", "gm", "<Plug>(coc-implementation)", {silent = true})
    keyset("n", "gr", "<Plug>(coc-references)", {silent = true})

    -- Use K to show documentation in preview window
    function _G.show_docs()
      local cw = vim.fn.expand('<cword>')
      if vim.fn.index({'vim', 'help'}, vim.bo.filetype) >= 0 then
        vim.api.nvim_command("h " .. cw)
      elseif vim.api.nvim_eval('coc#rpc#ready()') then
        vim.fn.CocActionAsync("doHover")
      else
        vim.api.nvim_command('!' .. vim.o.keywordprg .. ' ' .. cw)
      end
    end
    keyset("n", "K", '<CMD>lua _G.show_docs()<CR>', {silent = true})

    -- Highlight the symbol and its references on a CursorHold event(cursor is idle)
    vim.api.nvim_create_augroup("CocGroup", {})
    -- vim.api.nvim_create_autocmd("CursorHold", {
    --     group = "CocGroup",
    --     command = "silent call CocActionAsync('highlight')",
    --     desc = "Highlight symbol under cursor on CursorHold"
    --   })

    -- Symbol renaming
    keyset("n", "<leader>rn", "<Plug>(coc-rename)", {silent = true})

    -- -- Formatting selected code
    -- keyset("x", "<leader>f", "<Plug>(coc-format-selected)", {silent = true})
    -- keyset("n", "<leader>f", "<Plug>(coc-format-selected)", {silent = true})

    -- Setup formatexpr specified filetype(s)
    vim.api.nvim_create_autocmd("FileType", {
        group = "CocGroup",
        pattern = "typescript,json",
        command = "setl formatexpr=CocAction('formatSelected')",
        desc = "Setup formatexpr specified filetype(s)."
      })

    -- Update signature help on jump placeholder
    vim.api.nvim_create_autocmd("User", {
        group = "CocGroup",
        pattern = "CocJumpPlaceholder",
        command = "call CocActionAsync('showSignatureHelp')",
        desc = "Update signature help on jump placeholder"
      })

    -- Apply codeAction to the selected region
    -- Example: `<leader>aap` for current paragraph
    local opts = {silent = true, nowait = true}
    keyset("x", "<leader><leader>a", "<Plug>(coc-codeaction-selected)", opts)
    keyset("n", "<leader><leader>a", "<Plug>(coc-codeaction-selected)", opts)

    -- Remap keys for apply code actions at the cursor position.
    keyset("n", "<leader>ac", "<Plug>(coc-codeaction-cursor)", opts)
    -- Remap keys for apply code actions affect whole buffer.
    keyset("n", "<leader>as", "<Plug>(coc-codeaction-source)", opts)
    -- Remap keys for applying codeActions to the current buffer
    keyset("n", "<leader>ac", "<Plug>(coc-codeaction)", opts)
    -- Apply the most preferred quickfix action on the current line.
    keyset("n", "<leader>qf", "<Plug>(coc-fix-current)", opts)

    -- Remap keys for apply refactor code actions.
    keyset("n", "<leader>re", "<Plug>(coc-codeaction-refactor)", { silent = true })
    keyset("x", "<leader>r", "<Plug>(coc-codeaction-refactor-selected)", { silent = true })
    keyset("n", "<leader>r", "<Plug>(coc-codeaction-refactor-selected)", { silent = true })

    -- Run the Code Lens actions on the current line
    keyset("n", "<leader>cl", "<Plug>(coc-codelens-action)", opts)

    -- Map function and class text objects
    -- NOTE: Requires 'textDocument.documentSymbol' support from the language server
    keyset("x", "if", "<Plug>(coc-funcobj-i)", opts)
    keyset("o", "if", "<Plug>(coc-funcobj-i)", opts)
    keyset("x", "af", "<Plug>(coc-funcobj-a)", opts)
    keyset("o", "af", "<Plug>(coc-funcobj-a)", opts)
    keyset("x", "ic", "<Plug>(coc-classobj-i)", opts)
    keyset("o", "ic", "<Plug>(coc-classobj-i)", opts)
    keyset("x", "ac", "<Plug>(coc-classobj-a)", opts)
    keyset("o", "ac", "<Plug>(coc-classobj-a)", opts)

    -- Remap <C-f> and <C-b> to scroll float windows/popups
    ---@diagnostic disable-next-line: redefined-local
    local opts = {silent = true, nowait = true, expr = true}
    keyset("n", "<C-f>", 'coc#float#has_scroll() ? coc#float#scroll(1) : "<C-f>"', opts)
    keyset("n", "<C-b>", 'coc#float#has_scroll() ? coc#float#scroll(0) : "<C-b>"', opts)
    keyset("i", "<C-f>",
      'coc#float#has_scroll() ? "<c-r>=coc#float#scroll(1)<cr>" : "<Right>"', opts)
    keyset("i", "<C-b>",
      'coc#float#has_scroll() ? "<c-r>=coc#float#scroll(0)<cr>" : "<Left>"', opts)
    keyset("v", "<C-f>", 'coc#float#has_scroll() ? coc#float#scroll(1) : "<C-f>"', opts)
    keyset("v", "<C-b>", 'coc#float#has_scroll() ? coc#float#scroll(0) : "<C-b>"', opts)

    -- Use CTRL-S for selections ranges
    -- Requires 'textDocument/selectionRange' support of language server
    keyset("n", "<C-s>", "<Plug>(coc-range-select)", {silent = true})
    keyset("x", "<C-s>", "<Plug>(coc-range-select)", {silent = true})

    -- Add `:Format` command to format current buffer
    vim.api.nvim_create_user_command("Format", "call CocAction('format')", {})

    -- " Add `:Fold` command to fold current buffer
    vim.api.nvim_create_user_command("Fold", "call CocAction('fold', <f-args>)", {nargs = '?'})

    -- Add `:OR` command for organize imports of the current buffer
    vim.api.nvim_create_user_command("OR", "call CocActionAsync('runCommand', 'editor.action.organizeImport')", {})


    -- Add (Neo)Vim's native statusline support
    -- NOTE: Please see `:h coc-status` for integrations with external plugins that
    -- provide custom statusline: lightline.vim, vim-airline
    --vim.opt.statusline:prepend("%{coc#status()}%{get(b:,'coc_current_function','')}")

    -- Mappings for CoCList
    -- code actions and coc stuff
    ---@diagnostic disable-next-line: redefined-local
    local opts = {silent = true, nowait = true}
    -- Show all diagnostics
    keyset("n", "<space>a", ":<C-u>CocList diagnostics<cr>", opts)
    -- Manage extensions
    keyset("n", "<space>e", ":<C-u>CocList extensions<cr>", opts)
    -- Show commands
    keyset("n", "<space>c", ":<C-u>CocList commands<cr>", opts)
    -- Find symbol of current document
    keyset("n", "<space>o", ":<C-u>CocList outline<cr>", opts)
    -- Search workspace symbols
    keyset("n", "<space>s", ":<C-u>CocList -I symbols<cr>", opts)
    -- Do default action for next item
    keyset("n", "<space>j", ":<C-u>CocNext<cr>", opts)
    -- Do default action for previous item
    keyset("n", "<space>k", ":<C-u>CocPrev<cr>", opts)
    -- Resume latest coc list
    keyset("n", "<space>p", ":<C-u>CocListResume<cr>", opts)

    g.coc_jump_multiple_targets = 0

  end
}

add {
  "SmiteshP/nvim-navic",
  dependencies = "neovim/nvim-lspconfig"
}
add "neovim/nvim-lspconfig" --Maybe add { "tag": 'v0.1.3' }
add "kyazdani42/nvim-web-devicons"

add({
    "b0o/incline.nvim",
    enabled=false,
    config = function()
      require('incline').setup({
          window = {
            width = 'fit',
            placement = { horizontal = 'right', vertical = 'top' },
            margin = {
              horizontal = { left = 1, right = 0 },
              vertical = { bottom = 0, top = 1 },
            },
            padding = { left = 1, right = 1 },
            padding_char = ' ',
            winhighlight = {
              -- Normal = 'TreesitterContext',
            },
          },
          hide = {
            -- focused_win = true,
          },
          render = function(props)
            local filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(props.buf), ':t')
            local icon, color = require("nvim-web-devicons").get_icon_color(filename)

            local nav = {}
            local ok, nav_var = pcall(function() return vim.api.nvim_buf_get_var(props.buf, "coc_nav") end)
            if ok then
              for _, v in ipairs(nav_var) do
                table.insert(nav, {
                    '  ',
                  })
                table.insert(nav, {
                    v.label,
                    group = v.highlight,
                  })
                table.insert(nav, {
                    v.name,
                  })
              end
            end

            return {
              { icon, guifg = color },
              { ' ' },
              { filename },
              nav,
            }
          end
        })
    end,
  })
add "2072/PHP-Indenting-for-VIm"
add "AndrewRadev/sideways.vim"
add {
  "AndrewRadev/switch.vim",
  config = function ()
    -- tip:
    keyset("n", "-", ":Switch<CR>")
    vim.g.switch_custom_definitions = {
      { 'true', 'false' },
      { 'width', 'height' },
      { 'True', 'False' },
      { '==', '!=' },
      { '===', '!==' },
      { 'let', 'const' },
      { 'querySelectorAll(', 'querySelector(' },
      { 'after', 'before' },
      { 'left', 'right' },
      { 'up', 'down' },
      { 'previous', 'next' },
      { 'forward', 'back' },
      { 'push', 'pop' },
      { 'disable', 'enable' },
      { 'good', 'evil' },
    }
  end
}

add "HerringtonDarkholme/yats.vim"
add "PeterRincker/vim-searchlight"
add "Shougo/context_filetype.vim"
add "altercation/vim-colors-solarized"
add "ap/vim-css-color"
add "chr4/nginx.vim"
--add "christoomey/vim-tmux-navigator"
add "cpiger/NeoDebug"
add "dart-lang/dart-vim-plugin"
-- add {"dense-analysis/ale",
--   config = function ()
--     vim.cmd("let g:ale_fixers = { 'javascript': ['eslint'] }")
--     vim.cmd("let g:ale_sign_error = '⊛'")
--     vim.cmd("let g:ale_sign_warning = '⚠️'")
--     vim.cmd("let g:ale_virtualtext_cursor=0")
--   end
-- }
--add "eliba2/vim-node-inspect"
add "endaaman/vim-case-master"
add "evanleck/vim-svelte"
add {
  "folke/trouble.nvim",
  dependencies = "kyazdani42/nvim-web-devicons",
  config = function()
    require("trouble").setup { }
    vim.keymap.set("n", "TT", function() require("trouble").toggle() end)
    vim.keymap.set("n", "<leader>xx", function() require("trouble").toggle() end)
    vim.keymap.set("n", "<leader>xw", function() require("trouble").toggle("workspace_diagnostics") end)
    vim.keymap.set("n", "<leader>xd", function() require("trouble").toggle("document_diagnostics") end)
    vim.keymap.set("n", "<leader>xq", function() require("trouble").toggle("quickfix") end)
    vim.keymap.set("n", "<leader>xl", function() require("trouble").toggle("loclist") end)
    vim.keymap.set("n", "gR", function() require("trouble").toggle("lsp_references") end)
  end,
  opts = {
    mode = "lsp_document_diagnostics",
  }
}

add {
  "piersolenski/wtf.nvim",
  dependencies = {
    "MunifTanjim/nui.nvim",
  },
  opts = {},
  keys = {
    {
      "gw",
      mode = { "n", "x" },
      function()
        require("wtf").ai()
      end,
      desc = "Debug diagnostic with AI",
    },
    {
      mode = { "n" },
      "gW",
      function()
        require("wtf").search()
      end,
      desc = "Search diagnostic with Google",
    },
  },
}

add { "monaqa/dial.nvim" ,
  config = function()
    vim.api.nvim_set_keymap("n", "<C-a>", require("dial.map").inc_normal(), {noremap = true})
    vim.api.nvim_set_keymap("n", "<C-x>", require("dial.map").dec_normal(), {noremap = true})
    vim.api.nvim_set_keymap("v", "<C-a>", require("dial.map").inc_visual(), {noremap = true})
    vim.api.nvim_set_keymap("v", "<C-x>", require("dial.map").dec_visual(), {noremap = true})
    vim.api.nvim_set_keymap("v", "g<C-a>", require("dial.map").inc_gvisual(), {noremap = true})
    vim.api.nvim_set_keymap("v", "g<C-x>", require("dial.map").dec_gvisual(), {noremap = true})
  end
}

add "wsdjeg/vim-fetch"
--add "gcmt/breeze.vim"
add "ggreer/the_silver_searcher"
add {
  "google/vim-coverage",
  dependencies = "google/vim-maktaba",
  lazy = true
}
add {
  "google/vim-glaive",
  dependencies = "google/vim-maktaba",
  lazy = true
}
add "hail2u/vim-css3-syntax"
-- add "hrsh7th/cmp-buffer"
-- add "hrsh7th/cmp-cmdline"
-- add "hrsh7th/cmp-nvim-lsp"
-- add "hrsh7th/cmp-path"
-- if vim.g.is_mac then
--   add {"hrsh7th/cmp-emoji", dependencies = 'nvim-cmp'}
-- end
--add "hrsh7th/nvim-cmp"
add "machakann/vim-swap"
add "junegunn/goyo.vim"
add "junegunn/vim-easy-align"
add { "justinmk/vim-sneak",
  enabled = false,
  config = function()
    vim.cmd("nnoremap ;;; <Plug>Sneak_<cr>")
    vim.cmd("let g:sneak#s_next=1")
  end
}
add {"akinsho/bufferline.nvim",
  --tag = "v3.*",
  dependencies = 'nvim-tree/nvim-web-devicons',
  config = function() require("bufferline").setup{} end
}
add "leafOfTree/vim-svelte-plugin"
add "leafgarland/typescript-vim"
add "lewis6991/hover.nvim"
add "lukas-reineke/indent-blankline.nvim"

add {
  "mattn/emmet-vim",
  enabled = false,
  config = function ()
    -- type ctrl-m-comma to expand, e.g. 'fwb' becomes 'font-weight: bold' " tip
    vim.g.user_emmet_leader_key = 'C-m'
  end
}

add {
  "github/copilot.vim",
  version = "1.8",
  config = function ()
    vim.g.copilot_assume_mapped = true
    --vim.g.copilot_no_tab_map = true
    --vim.api.nvim_set_keymap("i", "<C-J>", 'copilot#Accept("<CR>")', { silent = true, expr = true })
    keyset("n", ",O", ":Copilot panel<CR>")
    keyset("i", "<C-J>", "call copilot#Accept(\"<CR>\")")
    keyset("n", ",CD", ":Copilot disable<CR>")
    keyset("n", ",CE", ":Copilot enable<CR>")
  end
}
add "mcchrish/nnn.vim"
add "metakirby5/codi.vim"
add {
  "mfussenegger/nvim-treehopper",
  config = function()
    cmd([[
      omap     <silent> m :<C-U>lua require('tsht').nodes()<CR>
      xnoremap <silent> m :lua require('tsht').nodes()<CR>
      ]])
  end
}
add {
  "mhinz/vim-startify",
}

add "mileszs/ack.vim"
add "natebosch/vim-lsc"
add "natebosch/vim-lsc-dart"
add "numToStr/Comment.nvim"
add "nvim-lua/plenary.nvim"
add "onsails/lspkind.nvim"
add "pangloss/vim-javascript"
--add "plasticboy/vim-markdown"

-- add {
-- "puremourning/vimspector",
-- config = function()
--   g.vimspector_base_dir = '/Users/raf/.local/share/nvim/lazy/vimspector'
--   g.vimspector_enable_mappings = 'VISUAL_STUDIO'
--   cmd([[
--     nnoremap <Leader>dd :call vimspector#Launch()<CR>
--     nnoremap <Leader>de :call vimspector#Reset()<CR>
--     nnoremap <Leader>dc :call vimspector#Continue()<CR>

--     nnoremap <Leader>dt :call vimspector#ToggleBreakpoint()<CR>
--     nnoremap <Leader>dT :call vimspector#ClearBreakpoints()<CR>

--     nmap <Leader>dk <Plug>VimspectorRestart
--     nmap <Leader>dh <Plug>VimspectorStepOut
--     nmap <Leader>dl <Plug>VimspectorStepInto
--       nmap <Leader>dj <Plug>VimspectorStepOver
--     ]])
--   end
-- }

add {
  "qpkorr/vim-renamer",
  config = function()
    -- tip:
    cmd("map RR :Ren<CR>")
  end
}
add "rafpaf/vim-autolog"
add "romainl/vim-cool"
add {
  "ron89/thesaurus_query.vim",
  config = function ()
    -- tip:
    -- ,cs to look up synonyms
    g.tq_openoffice_en_file = "/Applications/LibreOffice.app/Contents/Resources/extensions/dict-en/th_en_US_v2"
  end
}

add {"tami5/lspsaga.nvim",
  event = 'BufRead',
  config = function ()
    require('lspsaga').setup({})
    vim.keymap.set({"n","v"}, "<leader>ca", ":Lspsaga code_action<CR>")
    vim.keymap.set("n", "gh", ":Lspsaga lsp_finder<CR>")
    vim.keymap.set("n", "gr", ":Lspsaga rename<CR>")
  end,
  dependencies = 'nvim-tree/nvim-web-devicons'
}

add "thosakwe/vim-flutter"
add "tommcdo/vim-exchange"
add { "folke/tokyonight.nvim", priority = 2000, lazy = false,
  config = function()
    vim.cmd([[colorscheme tokyonight]])
  end,
}
add {
  "cshuaimin/ssr.nvim",
  config = function ()
    keyset({ "n", "x" }, "<leader>sr", function() require("ssr").open() end)
  end
}
add "willchao612/vim-diagon"
add "tpope/vim-abolish"
add "tpope/vim-eunuch"
add {
  "tpope/vim-fugitive",
  config = function ()
    keyset({ "n", "x" }, "\\B", ":Git blame<CR>")
    keyset({ "n", "x" }, "3b", ":Git blame<CR>")
    vim.api.nvim_create_user_command(
      'Browse',
      function (opts)
        vim.fn.system { 'open', opts.fargs[1] }
      end,
      { nargs = 1 }
      )
  end
}
add "tpope/vim-repeat"
add "tpope/vim-rhubarb"
add "karb94/neoscroll.nvim"
add {
  "tpope/vim-surround",
  config = function ()
    -- tip:
    -- select, then S', to wrap some text in single quotes " tip
    cmd([[
          map ," viWS"
          map ,' viWS'
          map ,( viWS(
          map ,{ viWS{
          map ,/ viWS/
          map ,\ viWS\
          map ,[ viWS[
          map ,~ viWS~
        ]])
  end
}
add "tpope/vim-unimpaired"
add "tweekmonster/django-plus.vim"
add "vifm/vifm"
add "vim-pandoc/vim-pandoc"
add "vim-scripts/applescript.vim"
add "vim-scripts/dbext.vim"

add {'williamboman/mason.nvim',
  config = function ()
    require("mason").setup()
  end
}

add {'williamboman/mason-lspconfig.nvim',
  config = function ()
    require("mason-lspconfig").setup()
  end
}

--add "wincent/vcs-jump"
add "yuezk/vim-js"
--add "tpope/vim-markdown"
add "clojure-vim/clojure.vim"

add {'clojure-vim/vim-jack-in',
  dependencies = {
    'tpope/vim-dispatch',
    'radenling/vim-dispatch-neovim'
  }
}


add "MaxMEllon/vim-jsx-pretty"

add {
  'phaazon/hop.nvim',
  enabled= false,
  branch = 'v2', -- optional but strongly recommended
  config = function()
    -- you can configure Hop the way you like here; see :h hop-config
    require'hop'.setup { keys = 'etovxqpdygfblzhckisuran' }
    -- local hop = require('hop')
    -- local directions = require('hop.hint').HintDirection
    -- vim.keymap.set('', 'f', function()
    --   hop.hint_char1({ direction = directions.AFTER_CURSOR, current_line_only = true })
    -- end, {remap=true})
    -- vim.keymap.set('', 'F', function()
    --   hop.hint_char1({ direction = directions.BEFORE_CURSOR, current_line_only = true })
    -- end, {remap=true})
    -- vim.keymap.set('', 't', function()
    --   hop.hint_char1({ direction = directions.AFTER_CURSOR, current_line_only = true, hint_offset = -1 })
    -- end, {remap=true})
    -- vim.keymap.set('', 'T', function()
    --   hop.hint_char1({ direction = directions.BEFORE_CURSOR, current_line_only = true, hint_offset = 1 })
    -- end, {remap=true})
    cmd([[
          map \w :HopWord<CR>
          map 0w :HopWord<CR>
          map \b :HopChar2<CR>
          map 0b :HopChar2<CR>
          map \p :HopPattern<CR>
          map L :HopLine<CR>
          map \a :HopAnywhere<CR>
          map 0a :HopAnywhere<CR>
        ]])

  end
}

add {'karb94/neoscroll.nvim',
  config = function()
    require('neoscroll').setup()
  end
}


add {
  "lewis6991/gitsigns.nvim", enabled = true,
  dependencies = { "nvim-lua/plenary.nvim" },
  config = function()
    require('gitsigns').setup{
      on_attach = function(bufnr)
        local gs = package.loaded.gitsigns

        local function map(mode, l, r, opts)
          opts = opts or {}
          opts.buffer = bufnr
          vim.keymap.set(mode, l, r, opts)
        end

        -- Navigation
        map('n', ']c', function()
          if vim.wo.diff then return ']c' end
          vim.schedule(function() gs.next_hunk() end)
          return '<Ignore>'
        end, {expr=true})

        map('n', '[c', function()
          if vim.wo.diff then return '[c' end
          vim.schedule(function() gs.prev_hunk() end)
          return '<Ignore>'
        end, {expr=true})

        -- Actions
        map('n', '<leader>hs', gs.stage_hunk)
        --map('n', '<leader>hr', gs.reset_hunk)
        map('v', '<leader>hs', function() gs.stage_hunk {vim.fn.line('.'), vim.fn.line('v')} end)
        map('v', '<leader>hr', function() gs.reset_hunk {vim.fn.line('.'), vim.fn.line('v')} end)
        map('n', '<leader>hS', gs.stage_buffer)
        map('n', '<leader>hu', gs.undo_stage_hunk)
        --map('n', '<leader>hR', gs.reset_buffer)
        map('n', '<leader>hp', gs.preview_hunk)
        map('n', '<leader>hb', function() gs.blame_line{full=true} end)
        map('n', '<leader>tb', gs.toggle_current_line_blame)
        map('n', '<leader>hd', gs.diffthis)
        map('n', '<leader>hD', function() gs.diffthis('~') end)
        map('n', '<leader>td', gs.toggle_deleted)

        -- Text object
        map({'o', 'x'}, 'ih', ':<C-U>Gitsigns select_hunk<CR>')
      end
    }
  end
}

add {'akinsho/git-conflict.nvim',
  config = function()
    require('git-conflict').setup()
  end
}

add 'gennaro-tedesco/nvim-peekup'

add {
  "AckslD/nvim-neoclip.lua",
  requires = {
    {'nvim-telescope/telescope.nvim'},
  },
  config = function()
    require('neoclip').setup()
  end,
}

-- add {
--   'notomo/gesture.nvim',
--   config = function()
--     vim.opt.mouse = "a"
--     vim.opt.mousemoveevent = true

--     vim.keymap.set("n", "<LeftDrag>", [[<Cmd>lua require("gesture").draw()<CR>]], { silent = true })
--     vim.keymap.set("n", "<LeftRelease>", [[<Cmd>lua require("gesture").finish()<CR>]], { silent = true })

--     -- or if you would like to use right click
--     vim.keymap.set("n", "<RightMouse>", [[<Nop>]])
--     vim.keymap.set("n", "<RightDrag>", [[<Cmd>lua require("gesture").draw()<CR>]], { silent = true })
--     vim.keymap.set("n", "<RightRelease>", [[<Cmd>lua require("gesture").finish()<CR>]], { silent = true })

--     local gesture = require("gesture")
--     gesture.register({
--         name = "scroll to bottom",
--         inputs = { gesture.up(), gesture.down() },
--         action = "normal! G",
--       })
--     gesture.register({
--         name = "next buffer",
--         inputs = { gesture.right() },
--         action = "bnext",
--       })
--     gesture.register({
--         name = "previous buffer",
--         inputs = { gesture.left() },
--         action = "bprevious"
--       })
--     gesture.register({
--         name = "go back",
--         inputs = { gesture.right(), gesture.left() },
--         -- map to `<C-o>` keycode
--         action = function()
--           vim.api.nvim_feedkeys(vim.keycode("<C-o>"), "n", true)
--         end,
--       })
--     gesture.register({
--         name = "close gesture traced windows",
--         match = function(ctx)
--           local last_input = ctx.inputs[#ctx.inputs]
--           return last_input and last_input.direction == "UP"
--         end,
--         can_match = function(ctx)
--           local first_input = ctx.inputs[1]
--           return first_input and first_input.direction == "RIGHT"
--         end,
--         action = function(ctx)
--           table.sort(ctx.window_ids, function(a, b)
--             return a > b
--           end)
--           for _, window_id in ipairs(vim.fn.uniq(ctx.window_ids)) do
--             vim.api.nvim_win_close(window_id, false)
--           end
--         end,
--       })
--   end,
-- }

add {'nvim-treesitter/nvim-treesitter',
  config = function ()
    require("nvim-treesitter.configs").setup {
      ensure_installed = { "c", "lua", "vim", "vimdoc", "query", "javascript", "typescript", "python" },
      incremental_selection = {
        enable = true,
        keymaps = {
          init_selection = "<CR>",
          scope_incremental = "<CR>",
          node_incremental = "<TAB>",
          node_decremental = "<S-TAB>",
        },
      },
    }
  end
}

add "tveskag/nvim-blame-line"

add {"stevearc/dressing.nvim"}
--add {"mbbill/undotree", config = req 'undotree'}

add {
  "pwntester/octo.nvim",
  dependencies = {
    'nvim-lua/plenary.nvim',
    'nvim-telescope/telescope.nvim',
    'kyazdani42/nvim-web-devicons',
  },
  config = function ()
    require"octo".setup()
    keyset("n", "<leader>oa", ":Octo actions<CR>")
  end
}

add {
    "james1236/backseat.nvim",
    config = function()
        require("backseat").setup({
            openai_model_id = 'gpt-4',
            language = 'english',
            -- split_threshold = 100,
            additional_instruction = "Respond in the style of a film noir",
            -- highlight = {
            --     icon = '', -- ''
            --     group = 'Comment',
            -- }
        })
      keyset("n", ",,b", ":Backseat<CR>")
      keyset("n", ",,B", ":BackseatClear<CR>")
    end
}

add {
  "folke/todo-comments.nvim",
  dependencies = "nvim-lua/plenary.nvim",
  config = function()
    require("todo-comments").setup()
  end
}

add {
  "folke/twilight.nvim",
  config = function()
    require("twilight").setup (
      {
        dimming = {
          alpha = 0.5, -- amount of dimming
        }
      }
      )
  end
}

add {
  "andymass/vim-matchup",
  config = function()
    vim.g.matchup_matchparen_offscreen = { method = "popup" }
  end
}
add {"kevinhwang91/nvim-hlslens",
  config = function ()
    require('hlslens').setup()
  end
}

add({
    "haya14busa/vim-asterisk",
    dependencies = { "kevinhwang91/nvim-hlslens" },
    config = function()
      vim.api.nvim_set_keymap('n', '*', [[<Plug>(asterisk-z*):lua require('hlslens').start()<Cr>]], { silent = true })
      vim.api.nvim_set_keymap('n', '#', [[<Plug>(asterisk-z#):lua require('hlslens').start()<Cr>]], { silent = true })
      vim.api.nvim_set_keymap('n', 'g*', [[<Plug>(asterisk-gz*):lua require('hlslens').start()<Cr>]], { silent = true })
      vim.api.nvim_set_keymap('n', 'g#', [[<Plug>(asterisk-gz#):lua require('hlslens').start()<Cr>]], { silent = true })
      vim.api.nvim_set_keymap('x', '*', [[<Plug>(asterisk-z*):lua require('hlslens').start()<Cr>]], { silent = true })
      vim.api.nvim_set_keymap('x', '#', [[<Plug>(asterisk-z#):lua require('hlslens').start()<Cr>]], { silent = true })
      vim.api.nvim_set_keymap('x', 'g*', [[<Plug>(asterisk-gz*):lua require('hlslens').start()<Cr>]], { silent = true })
      vim.api.nvim_set_keymap('x', 'g#', [[<Plug>(asterisk-gz#):lua require('hlslens').start()<Cr>]], { silent = true })
    end,
  })
add "chentoast/marks.nvim"
add "haya14busa/vim-metarepeat"
add {
  "David-Kunz/jester",
  config = function()
    require("jester").setup({
        cmd = "npm run test:ci -t '$result' -- $file",
        dap = {
          console = "externalTerminal",
        }
      })
  end,
}


add {
  "folke/which-key.nvim",
  config = function()
    vim.cmd('set timeoutlen=500')
    require("which-key").setup ({
        layout = {
          width = { max = 100 },
        },
    })
  end
}

-- add {"mxsdev/nvim-dap-vscode-js",
--   config = function()
--     require("dap-vscode-js").setup({
--         adapters = {
--             'pwa-node', 'pwa-chrome', 'pwa-msedge', 'node-terminal',
--             'pwa-extensionHost'
--         }
--     })
--   end
-- }


add {
  "microsoft/vscode-node-debug2",
  lazy = true,
  build = "npm install && NODE_OPTIONS=--no-experimental-fetch npm run build"
}

--add "szw/vim-maximizer"
--add "kassio/neoterm"
add 'tpope/vim-commentary'
add "hrsh7th/nvim-compe"
add "nvim-lua/popup.nvim"
--add "theHamsta/nvim-dap-virtual-text"

-- maybe this is causing problems?
--add 'ryanoasis/vim-devicons'

add 'folke/zen-mode.nvim'

add "mhartington/formatter.nvim"
add {
  'nvim-telescope/telescope.nvim',
  lazy = true,
  config = function ()
    cmd([[
      nnoremap ,G :Telescope git_branches<CR>
      nnoremap ,S :Telescope lsp_document_symbols<CR>
      nnoremap ,E :Telescope <CR>
      nnoremap 0 :Telescope <CR>
      nnoremap 00 :Telescope <CR>
      nnoremap ,cp :lua require('telescope').extensions.command_palette.command_palette()<CR>
        ]])

    keyset("n", "09", ":lua require('telescope.builtin').live_grep()<CR>", {silent = true})
    keyset("n", "<leader>sx", require("telescope.builtin").resume, {
        noremap = true,
        silent = true,
        desc = "Resume",
      })

    local actions = require("telescope.actions")

    local fixfolds = {
      hidden = true,
      mappings = {
        i = { ["<c-f>"] = actions.to_fuzzy_refine },
      },
      attach_mappings = function(_)
        telescope_actions.select:enhance({
            post = function() vim.cmd(":normal! zx") end
          })
        return true
      end,
    }

    require('telescope').setup({
        pickers = {
          buffers = fixfolds,
          find_files = fixfolds,
          git_files = fixfolds,
          grep_string = fixfolds,
          live_grep = fixfolds,
          oldfiles = fixfolds
        },
        extensions = {
          command_palette = {
            {"File",
              { "entire selection (C-a)", ':call feedkeys("GVgg")' },
              { "save current file (C-s)", ':w' },
              { "save all files (C-A-s)", ':wa' },
              { "quit (C-q)", ':qa' },
              { "file browser (C-i)", ":lua require'telescope'.extensions.file_browser.file_browser()", 1 },
              { "search word (A-w)", ":lua require('telescope.builtin').live_grep()", 1 },
              { "git files (A-f)", ":lua require('telescope.builtin').git_files()", 1 },
              { "files (C-f)",     ":lua require('telescope.builtin').find_files()", 1 },
            },
            {"Help",
              { "tips", ":help tips" },
              { "cheatsheet", ":help index" },
              { "tutorial", ":help tutor" },
              { "summary", ":help summary" },
              { "quick reference", ":help quickref" },
              { "search help(F1)", ":lua require('telescope.builtin').help_tags()", 1 },
            },
            {"Vim",
              { "reload vimrc", ":source $MYVIMRC" },
              { 'check health', ":checkhealth" },
              { "jumps (Alt-j)", ":lua require('telescope.builtin').jumplist()" },
              { "commands", ":lua require('telescope.builtin').commands()" },
              { "command history", ":lua require('telescope.builtin').command_history()" },
              { "registers (A-e)", ":lua require('telescope.builtin').registers()" },
              { "colorshceme", ":lua require('telescope.builtin').colorscheme()", 1 },
              { "vim options", ":lua require('telescope.builtin').vim_options()" },
              { "keymaps", ":lua require('telescope.builtin').keymaps()" },
              { "buffers", ":Telescope buffers" },
              { "search history (C-h)", ":lua require('telescope.builtin').search_history()" },
              { "paste mode", ':set paste!' },
              { 'cursor line', ':set cursorline!' },
              { 'cursor column', ':set cursorcolumn!' },
              { "spell checker", ':set spell!' },
              { "relative number", ':set relativenumber!' },
              { "search highlighting (F12)", ':set hlsearch!' },
            }
          }
        }
      })

    require('telescope').load_extension('command_palette')

    local telescope_actions = require("telescope.actions.set")

    -- nvim-telescope/telescope.nvim
    _G.telescope_find_files_in_path = function(path)
      local _path = path or vim.fn.input("Dir: ", "", "dir")
      require("telescope.builtin").find_files({search_dirs = {_path}})
    end
    _G.telescope_live_grep_in_path = function(path)
      local _path = path or vim.fn.input("Dir: ", "", "dir")
      require("telescope.builtin").live_grep({search_dirs = {_path}})
    end
    _G.telescope_files_or_git_files = function()
      local utils = require('telescope.utils')
      local builtin = require('telescope.builtin')
      local _, ret, _ = utils.get_os_command_output({
          'git', 'rev-parse', '--is-inside-work-tree'
        })
      if ret == 0 then
        builtin.git_files()
      else
        builtin.find_files()
      end
    end
    -- vim.keymap.set('n', '<leader>fD', function() telescope_live_grep_in_path() end)
    -- vim.keymap.set('n', '<leader><space>',
    --                function() telescope_files_or_git_files() end)
    -- vim.keymap.set('n', '<leader>fd', function() telescope_find_files_in_path() end)
    -- vim.keymap.set('n', '<leader>ft',
    --                function() telescope_find_files_in_path("./tests") end)
    -- vim.keymap.set('n', '<leader>fc', function()
    --     telescope_find_files_in_path("./node_modules/@sap/cds")
    -- end)
    -- vim.keymap.set('n', '<leader>fC', function()
    --     telescope_live_grep_in_path("./node_modules/@sap/cds")
    -- end)
    -- vim.keymap.set('n', '<leader>fT',
    --                function() telescope_live_grep_in_path("./tests") end)
    -- vim.keymap.set('n', '<leader>ff', ':Telescope live_grep<CR>')
    -- -- vim.keymap.set('n', '<leader>fo', ':Telescope file_browser<CR>')
    -- vim.keymap.set('n', '<leader>fn', ':Telescope find_files<CR>')
    -- vim.keymap.set('n', '<leader>fr', ':Telescope resume<CR>')
    -- vim.keymap.set('n', '<leader>fG', ':Telescope git_branches<CR>')
    -- vim.keymap.set('n', '<leader>fg', ':Telescope git_status<CR>')
    -- vim.keymap.set('n', '<c-\\>', ':Telescope buffers<CR>')
    -- vim.keymap.set('n', '<leader>fs', ':Telescope lsp_document_symbols<CR>')
    -- vim.keymap.set('n', '<leader>ff', ':Telescope live_grep<CR>')
    -- vim.keymap.set('n', '<leader>FF', ':Telescope grep_string<CR>')

  end
}
-- add 'nvim-telescope/telescope-ui-select.nvim'
--add "David-Kunz/markid"
--add "David-Kunz/spotlight"
add {"nvim-tree/nvim-tree.lua", dependencies = {'kyazdani42/nvim-web-devicons'},
  config = function()
    require('nvim-tree').setup({
        hijack_cursor = true,
        update_focused_file = {enable = true},
        view = {width = 60}
      })
    vim.keymap.set('n', '99', ':NvimTreeToggle<CR>', {silent = true})
  end
}
add 'kyazdani42/nvim-web-devicons'

add {
    'glacambre/firenvim',
    lazy = not vim.g.started_by_firenvim,
    build = function()
        vim.fn["firenvim#install"](0)
        cmd([[
          let fc = g:firenvim_config['localSettings']
          let fc['https?://[^/]*facebook.com/*'] = { 'takeover': 'never', 'priority': 1 }
        ]])
    end
}

-- was once needed to remove an error relating to ipairs
--add "tamago324/nlsp-settings.nvim"

--add 'David-Kunz/treesitter-unit'
-- add 'David-Kunz/ts-quickfix'
--add "David-Kunz/cmp-npm"
add {"marko-cerovac/material.nvim", lazy = true}
add "L3MON4D3/LuaSnip"
-- add "saadparwaiz1/cmp_luasnip"
--add "voldikss/vim-floaterm"
add "norcalli/nvim-colorizer.lua"


add {"liquidz/vim-iced",
  ft = {'clojure'},
  dependencies = {
    'guns/vim-sexp',
    'tpope/vim-sexp-mappings-for-regular-people',
  },
  config = function()
    vim.g.iced_enable_default_key_mappings = true
    vim.g.iced_default_key_mapping_leader = '<LocalLeader>'
  end
}
cmd("let maplocalleader = ' '")

add {"liquidz/vim-iced-coc-source",
  -- This plugin complains that a certain version of vim-iced is required. We
  -- have a more recent version installed but it still complains
  --enabled = false,
  lazy = true,
  ft = {'clojure'},
  dependencies = {"liquidz/vim-iced"}
}

lazy_options = {
  ui = {
    icons = {
      cmd = "⌘",
      config = "🛠",
      event = "📅",
      ft = "📂",
      init = "⚙",
      keys = "🗝",
      plugin = "🔌",
      runtime = "💻",
      source = "📄",
      start = "🚀",
      task = "📌",
      lazy = "💤 ",
    },
  },
}

-- typescript key mappings
-- cmd("au FileType typescript inoremap <buffer> <C-N> : number")
-- cmd("au FileType typescript inoremap <buffer> <C-S> : string")
-- cmd("au FileType typescript inoremap <buffer> <C-B> : boolean")

-- For plugin sheerun/vim-polyglot
-- polyglot's sql highlighting interferes with some javascript strings
cmd("let g:polyglot_disabled = ['sql']")

require("lazy").setup(plugins, lazy_options)

keyset("n", ";;", ":Lazy<CR>")

-- These used to be in init.vim. Delete if not needed anymore.
cmd('set runtimepath^=~/.vim runtimepath+=~/.vim/after')
cmd('let &packpath=&runtimepath')

cmd('source ~/.vimrc')

local runtime_path = vim.split(package.path, ';')
table.insert(runtime_path, "lua/?.lua")
table.insert(runtime_path, "lua/?/init.lua")

-- Source a Lua file
local function req(plugin)
	return 'require "plugin/'..plugin..'"'
end

plugins = {}

-- code that bootstraps lazy.nvimn
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- note that you can sometimes get packages faster from fastgit: 'https://hub.fastgit.xyz/%s'

-- default options
opt.completeopt = {'menu', 'menuone', 'noselect'}
opt.laststatus = 3
opt.mouse = 'a'
opt.splitright = true
opt.splitbelow = true
opt.expandtab = true
opt.tabstop = 2
opt.shiftwidth = 2
opt.number = true
opt.ignorecase = true
opt.smartcase = true
opt.incsearch = true
opt.so = 10
-- opt.relativenumber = true
vim.cmd('set nonumber')
vim.cmd('set norelativenumber')
-- set diffopt+=vertical " starts diff mode in vertical split
opt.cmdheight = 1
opt.ls = 0
-- set shortmess+=c " don't need to press enter so often
opt.signcolumn = 'yes'
opt.updatetime = 520
opt.undofile = true
cmd('filetype plugin on')
opt.backup = false
g.netrw_banner = false
g.netrw_liststyle = 3
g.markdown_fenced_languages = {'javascript', 'javascript=js', 'js=javascript', 'json=javascript', 'clojure'}

-- opt.path:append({ "**" })
vim.cmd([[set path=$PWD/**]])

vim.cmd([[

function! ToggleJestOnlyGlobal()
  let cursor_position = getpos('.')
  let current_line = getline('.')

  " Search backwards from the current line for the nearest occurrence of it( or describe(
  let match_pos_it = search('\v(it|it\.only)\(', 'bcnW')
  let match_pos_describe = search('\v(describe|describe\.only)\(', 'bcnW')

  " If no match was found in backward search, reset cursor position and echo a message
  if match_pos_it == 0 && match_pos_describe == 0
    call setpos('.', cursor_position)
    echo "No 'it' or 'describe' block found."
    return
  endif

  " Determine the nearest block to toggle .only
  let nearest_match_pos = match_pos_it == 0 ? match_pos_describe : (match_pos_describe == 0 ? match_pos_it : (match_pos_it > match_pos_describe ? match_pos_it : match_pos_describe))
  let target_line = getline(nearest_match_pos)
  let statement = target_line =~ '^\s*it\(\.only\)\?' ? 'it' : (target_line =~ '^\s*describe\(\.only\)\?' ? 'describe' : '')

  if statement == ''
    call setpos('.', cursor_position)
    echo "No toggleable 'it' or 'describe' block found."
    return
  endif

  " Perform the toggle on the identified line
  if target_line =~ '\<'. statement . '\.only'
    let modified_line = substitute(target_line, '\<'. statement . '\.only', statement, '')
  else
    let modified_line = substitute(target_line, '\<'. statement . '\>', statement . '.only', '')
  endif

  " Update the line with the modified content
  call setline(nearest_match_pos, modified_line)

  " Reset the cursor to its original position
  call setpos('.', cursor_position)
endfunction

nnoremap <leader>jo :call ToggleJestOnlyGlobal()<CR>
]])

-- David-Kunz/cmp-npm
--require('cmp-npm').setup({ignore = {"beta", "rc"}})

--vim.keymap.set('n', 'gd', function() vim.lsp.buf.definition() end)
--vim.keymap.set('n', 'gh', function() vim.lsp.buf.hover() end)
--vim.keymap.set('n', 'gD', function() vim.lsp.buf.implementation() end)
--vim.keymap.set('n', '<c-k>', function() vim.lsp.buf.signature_help() end)
--vim.keymap.set('n', 'gr', function() vim.lsp.buf.references() end)
--vim.keymap.set('n', 'gR', function() vim.lsp.buf.rename() end)
--vim.keymap.set('n', 'ga', function() vim.lsp.buf.code_action() end)
--vim.keymap.set('n', 'ge', function() vim.diagnostic.goto_next() end)
--vim.keymap.set('n', 'gE', function() vim.diagnostic.goto_prev() end)
--vim.keymap.set('n', 'gA', ':Telescope lsp_range_code_actions<CR>')

-- CDS
-- cmd([[
-- augroup MyCDSCode
--      autocmd!
--      autocmd BufReadPre,FileReadPre *.cds set ft=cds
-- augroup END
-- ]])
-- local lspconfig = require'lspconfig'
-- local configs = require'lspconfig.configs'
-- if not configs.sapcds_lsp then
--   configs.sapcds_lsp = {
--     default_config = {
--       cmd = {vim.fn.expand("$HOME/projects/startcdslsp")};
--       filetypes = {'cds'};
--       root_dir = lspconfig.util.root_pattern('.git', 'package.json'),
--       settings = {};
--     };
--   }
-- end
-- if lspconfig.sapcds_lsp.setup then
--   lspconfig.sapcds_lsp.setup{
--     -- capabilities = require('cmp_nvim_lsp').update_capabilities(vim.lsp.protocol.make_client_capabilities())
--   }
-- end

vim.keymap.set('n', '<leader><esc><esc>', ':tabclose<CR>')

-- vim.g.material_style = "darker"
-- vim.cmd 'colorscheme material'
vim.opt.fillchars = {
    horiz = '█',
    horizup = '█',
    horizdown = '█',
    vert = '█',
    vertleft = '█',
    vertright = '█',
    verthoriz = '█'
}

vim.g.floaterm_width = 0.95
vim.g.floaterm_height = 0.95
vim.keymap.set('n', '<leader>g', ':FloatermNew lazygit<CR>')

cmd('set foldmethod=expr')
--cmd('set foldexpr=nvim_treesitter#foldexpr()')

vim.keymap.set('n', '<leader>n', ':tabe ~/tmp/notes.md<CR>')

--local parser_config = require('nvim-treesitter.parsers').get_parser_configs()
--require'nvim-treesitter.configs'.setup {
--    highlight = {enable = true},
--    markid = {enable = false}
--}

-- mfussenegger/nvim-dap
--- local dap = require('dap')
--- dap.adapters.node2 = {
---     type = 'executable',
---     command = 'node',
---     args = {
---         os.getenv('HOME') ..
---             '/.local/share/nvim/site/pack/packer/opt/vscode-node-debug2/out/src/nodeDebug.js'
---     }
--- }
--- dap.configurations.javascript = {
--- 	{
--- 		type = "node2",
--- 		request = "launch",
--- 		program = "${workspaceFolder}/${file}",
--- 		cwd = vim.fn.getcwd(),
--- 		sourceMaps = true,
--- 		protocol = "inspector",
--- 		console = "integratedTerminal",
--- 	},
--- }
---
---  require('dap').set_log_level('INFO')
---  vim.fn.sign_define('DapBreakpoint',
---                     {text = '🟥', texthl = '', linehl = '', numhl = ''})
---  vim.fn.sign_define('DapBreakpointRejected',
---                     {text = '🟦', texthl = '', linehl = '', numhl = ''})
---  vim.fn.sign_define('DapStopped',
---                     {text = '⭐️', texthl = '', linehl = '', numhl = ''})
---
---  vim.keymap.set('n', '<leader>dh',
---                 function() require"dap".toggle_breakpoint() end)
---  vim.keymap.set('n', '<leader>dH',
---                 ":lua require'dap'.set_breakpoint(vim.fn.input('Breakpoint condition: '))<CR>")
---  vim.keymap.set({'n', 't'}, '<A-k>', function() require"dap".step_out() end)
---  vim.keymap.set({'n', 't'}, "<A-l>", function() require"dap".step_into() end)
---  vim.keymap.set({'n', 't'}, '<A-j>', function() require"dap".step_over() end)
---  vim.keymap.set({'n', 't'}, '<A-h>', function() require"dap".continue() end)
---  vim.keymap.set('n', '<leader>dn', function() require"dap".run_to_cursor() end)
---  vim.keymap.set('n', '<leader>dc', function() require"dap".terminate() end)
---  vim.keymap.set('n', '<leader>dR',
---                 function() require"dap".clear_breakpoints() end)
---  vim.keymap.set('n', '<leader>de',
---                 function() require"dap".set_exception_breakpoints({"all"}) end)
---  vim.keymap.set('n', '<leader>da', function() require"debugHelper".attach() end)
---  vim.keymap.set('n', '<leader>dA',
---                 function() require"debugHelper".attachToRemote() end)
---  vim.keymap
---      .set('n', '<leader>di', function() require"dap.ui.widgets".hover() end)
---  vim.keymap.set('n', '<leader>d?', function()
---      local widgets = require "dap.ui.widgets";
---      widgets.centered_float(widgets.scopes)
---  end)
---  vim.keymap.set('n', '<leader>dk', ':lua require"dap".up()<CR>zz')
---  vim.keymap.set('n', '<leader>dj', ':lua require"dap".down()<CR>zz')
---  vim.keymap.set('n', '<leader>dr',
---                 ':lua require"dap".repl.toggle({}, "vsplit")<CR><C-w>l')
---  vim.keymap.set('n', '<leader>du', ':lua require"dapui".toggle()<CR>')
---
--- -- nvim-telescope/telescope-dap.nvim
--- require('telescope').load_extension('dap')
--- vim.keymap.set('n', '<leader>ds', ':Telescope dap frames<CR>')
--- vim.keymap.set('n', '<leader>dc', ':Telescope dap commands<CR>')
--- vim.keymap.set('n', '<leader>db', ':Telescope dap list_breakpoints<CR>')
---
--- require('nvim-dap-virtual-text').setup()

-- David-Kunz/jester
-- require'jester'.setup({path_to_jest = "/opt/homebrew/bin/jest"})
-- require'jester'.setup({ dap = { type = 'pwa-node'}})
-- require'jester'.setup({ path_to_jest = "/opt/homebrew/bin/jest", dap = { type = 'pwa-node' } })
-- vim.keymap.set('n', '<leader>tt', function() require"jester".run() end)
-- vim.keymap.set('n', '<leader>t_', function() require"jester".run_last() end)
-- vim.keymap.set('n', '<leader>tf', function() require"jester".run_file() end)
-- vim.keymap.set('n', '<leader>d_', function() require"jester".debug_last() end)
-- vim.keymap.set('n', '<leader>df', function() require"jester".debug_file() end)
-- vim.keymap.set('n', '<leader>dq', function() require"jester".terminate() end)
-- vim.keymap.set('n', '<leader>dd', function() require"jester".debug() end)

-- lua language server
-- local system_name
-- if vim.fn.has("mac") == 1 then
--   system_name = "macOS"
-- elseif vim.fn.has("unix") == 1 then
--   system_name = "Linux"
-- elseif vim.fn.has('win32') == 1 then
--   system_name = "Windows"
-- else
--   print("Unsupported system for sumneko")
-- end

-- -- set the path to the sumneko installation; if you previously installed via the now deprecated :LspInstall, add
-- local sumneko_root_path = os.getenv('HOME') ..'/apps/lua-language-server'
-- local sumneko_binary = sumneko_root_path.."/bin/"..system_name.."/lua-language-server"


-- require'lspconfig'.sumneko_lua.setup {
--   capabilities = require('cmp_nvim_lsp').update_capabilities(vim.lsp.protocol.make_client_capabilities()),
--   cmd = {sumneko_binary, "-E", sumneko_root_path .. "/main.lua"};
--   settings = {
--     Lua = {
--       runtime = {
--         -- Tell the language server which version of Lua you're using (most likely LuaJIT in the case of Neovim)
--         version = 'LuaJIT',
--         -- Setup your lua path
--         path = runtime_path,
--       },
--       diagnostics = {
--         -- Get the language server to recognize the `vim` global
--         globals = {'vim'},
--       },
--       workspace = {
--         -- Make the server aware of Neovim runtime files
--         library = vim.api.nvim_get_runtime_file("", true),
--       },
--       -- Do not send telemetry data containing a randomized but unique identifier
--       telemetry = {
--         enable = false,
--       },
--     },
--   },
-- }

vim.keymap.set('n', '[b', ':bnext<CR>')
vim.keymap.set('n', ']b', ':bprev<CR>')

-- custom folder icon
require'nvim-web-devicons'.setup({
    override = {
        lir_folder_icon = {
            icon = "",
            color = "#7ebae4",
            name = "LirFolderNode"
        }
    }
})
-- add visual mode
function _G.LirSettings()
    vim.api.nvim_buf_set_keymap(0, 'x', 'J',
                                ':<C-u>lua require"lir.mark.actions".toggle_mark("v")<CR>',
                                {noremap = true, silent = true})

    -- echo cwd
    vim.api.nvim_echo({{vim.fn.expand('%:p'), 'Normal'}}, false, {})
end
vim.cmd [[augroup lir-settings]]
vim.cmd [[  autocmd!]]
vim.cmd [[  autocmd Filetype lir :lua LirSettings()]]
vim.cmd [[augroup END]]

-- global mark I for last edit
vim.cmd [[autocmd InsertLeave * execute 'normal! mI']]

-- highlight on yank
vim.cmd(
    [[au TextYankPost * lua vim.highlight.on_yank {higroup="IncSearch", timeout=150, on_visual=true}]])


vim.keymap.set('n', '<leader>w', ':w<CR>')

vim.keymap.set('t', '<Esc>', '<C-\\><C-n>')

vim.cmd('iabbrev :tup: 👍')
vim.cmd('iabbrev :tdo: 👎')
vim.cmd('iabbrev :smi: 😊')
vim.cmd('iabbrev :sad: 😔')
vim.cmd('iabbrev darkred #8b0000')
vim.cmd('iabbrev darkgreen #006400')

_G.term_buf_of_tab = _G.term_buf_of_tab or {}
_G.term_buf_max_nmb = _G.term_buf_max_nmb or 0

local function spawn_terminal()
    local cur_tab = vim.api.nvim_get_current_tabpage()
    vim.cmd('vs | terminal')
    local cur_buf = vim.api.nvim_get_current_buf()
    _G.term_buf_max_nmb = _G.term_buf_max_nmb + 1
    vim.api.nvim_buf_set_name(cur_buf, "Terminal " .. _G.term_buf_max_nmb)
    table.insert(_G.term_buf_of_tab, cur_tab, cur_buf)
    vim.cmd(':startinsert')
end

function Toggle_terminal()
    local cur_tab = vim.api.nvim_get_current_tabpage()
    local term_buf = term_buf_of_tab[cur_tab]
    if term_buf ~= nil then
        local cur_buf = vim.api.nvim_get_current_buf()
        if cur_buf == term_buf then
            vim.cmd('q')
        else
            local win_list = vim.api.nvim_tabpage_list_wins(cur_tab)
            for _, win in ipairs(win_list) do
                local win_buf = vim.api.nvim_win_get_buf(win)
                if win_buf == term_buf then
                    vim.api.nvim_set_current_win(win)
                    vim.cmd(':startinsert')
                    return
                end
            end
            vim.cmd('vert sb' .. term_buf)
            vim.cmd(':startinsert')
        end
    else
        spawn_terminal()
        vim.cmd(':startinsert')
    end
end
vim.keymap.set('n', '<c-y>', Toggle_terminal)
vim.keymap.set('i', '<c-y>', '<ESC>:lua Toggle_terminal()<CR>')
vim.keymap.set('t', '<c-y>', '<c-\\><c-n>:lua Toggle_terminal()<CR>')
-- cmd([[
-- if has('nvim')
--    au! TermOpen * tnoremap <buffer> <Esc> <c-\><c-n>
-- endif]])

Send_line_to_terminal = function()
    local curr_line = vim.api.nvim_get_current_line()
    local cur_tab = vim.api.nvim_get_current_tabpage()
    local term_buf = term_buf_of_tab[cur_tab]
    if term_buf == nil then
        spawn_terminal()
        term_buf = term_buf_of_tab[cur_tab]
    end
    for _, chan in pairs(vim.api.nvim_list_chans()) do
        if chan.buffer == term_buf then chan_id = chan.id end
    end
    vim.api.nvim_chan_send(chan_id, curr_line .. '\n')
end

vim.keymap.set('n', '<leader><leader>x', ':lua Send_line_to_terminal()<CR>')

--require"nvim-treesitter.configs".setup {playground = {enable = true}}

vim.keymap.set('n', '<c-o>', '<c-o>zz')
vim.keymap.set('n', '<c-i>', '<c-i>zz')

-- 'L3MON4D3/LuaSnip'
local has_words_before = function()
    local line, col = unpack(vim.api.nvim_win_get_cursor(0))
    return col ~= 0 and
               vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col,
                                                                          col)
                   :match("%s") == nil
end

-- local ls = require("luasnip")
-- local cmp = require("cmp")

-- cmp.setup({
--     snippet = {expand = function(args) ls.lsp_expand(args.body) end},
--     mapping = {
--         ['<C-Space>'] = cmp.mapping.complete(),
--         ['<CR>'] = cmp.mapping.confirm({select = false}),
--         ['<C-d>'] = cmp.mapping.scroll_docs(-4),
--         ['<C-f>'] = cmp.mapping.scroll_docs(4),
--         ['<C-n>'] = cmp.mapping.select_next_item({
--             behavior = cmp.SelectBehavior.Insert
--         }),
--         ['<C-p>'] = cmp.mapping.select_prev_item({
--             behavior = cmp.SelectBehavior.Insert
--         }),
--         ["<Tab>"] = cmp.mapping(function(fallback)
--             if ls.expand_or_jumpable() then
--                 ls.expand_or_jump()
--             else
--                 fallback()
--             end
--         end, {"i", "s"}),

--         ["<S-Tab>"] = cmp.mapping(function(fallback)
--             if ls.jumpable(-1) then
--                 ls.jump(-1)
--             else
--                 fallback()
--             end
--         end, {"i", "s"})
--     },
--     sources = {
--         {name = 'npm'}, {name = 'luasnip'}, {name = 'nvim_lsp'},
--         {name = 'buffer', keyword_length = 5}
--     }
--     -- formatting = {
--     --   format = lspkind.cmp_format({with_text = false, maxwidth = 50})
--     -- }
-- })

local t = function(str)
    return vim.api.nvim_replace_termcodes(str, true, true, true)
end

-- _G.expand = function()
--     -- print("hurray!!")
--     if ls.expand_or_jumpable() then return t("<Plug>luasnip-expand-or-jump") end
--     return ''
-- end

-- _G.expand_back = function()
--     -- print("hurray!!")
--     if ls.jumpable(-1) then return t("<Plug>luasnip-jump-prev") end
--     return ''
-- end

-- vim.api.nvim_set_keymap('i', '<c-j>', 'v:lua.expand()', {expr = true})
-- vim.api.nvim_set_keymap('i', '<c-k>', 'v:lua.expand_back()', {expr = true})
-- vim.api.nvim_set_keymap('s', '<c-j>', 'v:lua.expand()', {expr = true})
-- vim.api.nvim_set_keymap('s', '<c-k>', 'v:lua.expand_back()', {expr = true})

-- vim.keymap.set('n', '<leader>ls',
--                '<cmd>source ~/.config/nvim/after/plugin/luasnip.lua<CR>')

_G.test_dap = function()
    local dap = require 'dap'
    -- dap.terminate(nil, nil, function()
    --   vim.wait(2000, function()
    --     local session = dap.session()
    --     return session and session.initialized
    --   end)
    -- dap.run({
    --   console = "integratedTerminal",
    --   cwd = "/Users/d065023/tmp/node-test",
    --   disableOptimisticBPs = true,
    --   port = 9229,
    --   protocol = "inspector",
    --   request = "launch",
    --   runtimeArgs = { "--inspect-brk", "plain.js" },
    --   type = "pwa-node"
    --   })
    -- end)
    dap.run({
        type = 'pwa-node',
        request = 'launch',
        cwd = '/Users/d065023/tmp/node-test',
        rootPath = '/Users/d065023/tmp/node-test',
        runtimeArgs = {
            '--inspect-brk', './node_modules/.bin/jest', '--no-coverage', '-t',
            '^foo$', '--', 'sample.test.js'
        },
        args = {'--no-cache'},
        console = 'integratedTerminal'
    })
end

-- ldelossa/gh.nvim
-- require('litee.lib').setup()
-- require('litee.gh').setup({
--   prefer_https_remote = true
-- })

-- nvim-telescope/telescope-ui-select.nvim
-- require("telescope").load_extension("ui-select")

-- require("github-theme").setup({
--   theme_style = "dark",
-- })

-- vim.api.nvim_create_autocmd('BufHidden',  {
--     pattern  = '[dap-terminal]*',
--     callback = function(arg)
--       vim.schedule(function() vim.api.nvim_buf_delete(arg.buf, { force = true }) end)
--     end
-- })

-- local dap, dapui = require("dap"), require("dapui")
-- dapui.setup()
-- vim.keymap.set('n', '<leader>do', function() require("dapui").open() end)
-- vim.keymap.set('n', '<leader>dC', function() require("dapui").close() end)
-- -- dap.listeners.after.event_initialized["dapui_config"] = function()
-- --   dapui.open()
-- -- end
-- dap.listeners.before.event_terminated["dapui_config"] =
--     function() dapui.close() end
-- dap.listeners.before.event_exited["dapui_config"] = function() dapui.close() end

function Test()
    package.loaded.NeovimConf = nil
    require('NeovimConf').todo()
end

vim.api.nvim_create_user_command("Test", Test, {})

--local runtime_path = vim.split(package.path, ';')
--table.insert(runtime_path, "lua/?.lua")
--table.insert(runtime_path, "lua/?/init.lua")

-- Mappings.
-- See `:help vim.diagnostic.*` for documentation on any of the below functions
local opts = { noremap=true, silent=true }
vim.api.nvim_set_keymap('n', '<space>e', '<cmd>lua vim.diagnostic.open_float()<CR>', opts)
vim.api.nvim_set_keymap('n', '[d', '<cmd>lua vim.diagnostic.goto_prev()<CR>', opts)
vim.api.nvim_set_keymap('n', ']d', '<cmd>lua vim.diagnostic.goto_next()<CR>', opts)
vim.api.nvim_set_keymap('n', '<space>q', '<cmd>lua vim.diagnostic.setloclist()<CR>', opts)

-- add an on_attach function to only map the following keys
-- after the language server attaches to the current buffer
local on_attach = function(client, bufnr)
  -- Enable completion triggered by <c-x><c-o>
  vim.api.nvim_buf_set_option(bufnr, 'omnifunc', 'v:lua.vim.lsp.omnifunc')

  -- Mappings.
  -- See `:help vim.lsp.*` for documentation on any of the below functions
  vim.api.nvim_buf_set_keymap(bufnr, 'n', 'gD', '<cmd>lua vim.lsp.buf.declaration()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', 'gd', '<cmd>lua vim.lsp.buf.definition()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', 'K', '<cmd>lua vim.lsp.buf.hover()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', 'gi', '<cmd>lua vim.lsp.buf.implementation()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', '<C-k>', '<cmd>lua vim.lsp.buf.signature_help()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', ',,wa', '<cmd>lua vim.lsp.buf.add_workspace_folder()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', ',,wr', '<cmd>lua vim.lsp.buf.remove_workspace_folder()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', ',,wl', '<cmd>lua print(vim.inspect(vim.lsp.buf.list_workspace_folders()))<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', ',,D', '<cmd>lua vim.lsp.buf.type_definition()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', ',,rn', '<cmd>lua vim.lsp.buf.rename()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', ',,a', '<cmd>lua vim.lsp.buf.code_action()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', 'gr', '<cmd>lua vim.lsp.buf.references()<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, 'n', ',,f', '<cmd>lua vim.lsp.buf.formatting()<CR>', opts)
end

-- add a loop to conveniently call 'setup' on multiple servers and
-- map buffer local keybindings when the language server attaches
local servers = {
    'pyright',
    'tsserver'
  --'rust_analyzer',
}
for _, lsp in pairs(servers) do
  require('lspconfig')[lsp].setup {
    on_attach = on_attach,
    flags = {
      -- This will be the default in neovim 0.7+
      debounce_text_changes = 150,
    }
  }
end

-- Neovim doesn't support snippets out of the box, so we need to mutate the
-- capabilities we send to the language server to let them know we want snippets.
local capabilities = vim.lsp.protocol.make_client_capabilities()
capabilities.textDocument.completion.completionItem.snippetSupport = true

-- Setup our autocompletion. These configuration options are the default ones
-- copied out of the documentation.
-- local cmp = require("cmp")

-- cmp.setup({
--   snippet = {
--     expand = function(args)
--       -- For `vsnip` user.
--       vim.fn["vsnip#anonymous"](args.body)
--     end,
--   },
--   mapping = {
--     ["<C-b>"] = cmp.mapping.scroll_docs(-4),
--     ["<C-f>"] = cmp.mapping.scroll_docs(4),
--     ["<C-Space>"] = cmp.mapping.complete(),
--     ["<C-e>"] = cmp.mapping.close(),
--     ["<C-y>"] = cmp.mapping.confirm({ select = true }),
--   },
--   sources = {
--     { name = "nvim_lsp" },
--     { name = "vsnip" },
--   },
--   formatting = {
--     format = require("lspkind").cmp_format({
--       with_text = true,
--       menu = {
--         nvim_lsp = "[LSP]",
--       },
--     }),
--   },
-- })


-- Finally, let's initialize the Elixir language server

-- Replace the following with the path to your installation
local path_to_elixirls = vim.fn.expand("~/apps/elixir-ls/release/language_server.sh")

require('lspconfig').elixirls.setup({
  cmd = {path_to_elixirls},
  capabilities = capabilities,
  on_attach = on_attach,
  settings = {
    elixirLS = {
      -- I choose to disable dialyzer for personal reasons, but
      -- I would suggest you also disable it unless you are well
      -- acquainted with dialzyer and know how to add it.
      dialyzerEnabled = false,
      -- I also choose to turn off the auto dep fetching feature.
      -- It often gets into a weird state that requires deleting
      -- the .elixir_ls directory and restarting your editor.
      fetchDeps = false
    }
  }
})

function create_styled_component()
  -- Get the current word under the cursor
  local word = vim.fn.expand("<cword>")

  -- Check if we've actually got a word
  if word == '' then
    print("No word under cursor.")
    return
  end

  -- Get the current filename without an extension
  local filename = vim.fn.expand("%:r")

  -- The name of the new file
  local new_filename = filename .. ".styled.tsx"

  -- The content to be inserted
  local content = "export const " .. word .. " = styled.div``;"
  -- print content
  print(content)

  -- Check if file already exists, and if it does, load it
  local file_exists = vim.fn.filereadable(new_filename)
  if file_exists ~= 0 then
    -- Edit the existing file
    vim.api.nvim_command('edit ' .. new_filename)
  else
    -- Create a new file and switch to it
    vim.api.nvim_command('edit ' .. new_filename)
  end

  local bufnr = vim.api.nvim_get_current_buf()

  -- Check if the content already exists
  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  for _, line in ipairs(lines) do
    if line:find("^export const " .. word .. " =") then
      print("Component '" .. word .. "' already exists in " .. new_filename)
      return
    end
  end

  -- Actually insert the content, at the end of the file (append)
  vim.api.nvim_buf_set_lines(bufnr, -1, -1, false, {content, ""})

  -- Save the file
  vim.api.nvim_command('write')
end

keyset("n", "<leader>sc", ":lua create_styled_component()<CR>", {silent = true})

-- For looking up repo descriptions in this file, put the cursor in the string
-- and press this keybinding.
cmd("autocmd FileType lua map <buffer> K cs'\"yi\":!curl -s https://api.github.com/repos/<C-R>\" \\| jq '.description' \\| sed 's/\"//g'<CR>")

cmd([[

nmap <leader><leader>t :e /Users/raf/projects/spinoza/works/ttp-.mkd<CR>
nmap <leader><leader>T :e /Users/raf/projects/spinoza/works/ttp.mkd<CR>
nmap <leader><leader>i :e /users/raf/projects/spinoza/works/tie-.mkd<cr>
nmap <leader><leader>I :e /Users/raf/projects/spinoza/works/tie.mkd<CR>
nmap <leader><leader>p :e /users/raf/projects/spinoza/works/tp-.mkd<cr>
nmap <leader><leader>P :e /Users/raf/projects/spinoza/works/tp.mkd<CR>
nmap <leader><leader>k :e /Users/raf/projects/spinoza/works/kv-.mkd<CR>
nmap <leader><leader>K :e /Users/raf/projects/spinoza/works/kv.mkd<CR>
nmap <leader><leader>L :e /Users/raf/projects/spinoza/works/ethica.bds<CR>
nmap <leader><leader>e :e /Users/raf/projects/spinoza/works/ethics-curley.bds<CR>
nmap <leader><leader>c :e /Users/raf/projects/spinoza/works/cm-.mkd<CR>
nmap <leader><leader>C :e /Users/raf/projects/spinoza/works/cm.mkd<CR>
nmap <leader><leader>d :e /Users/raf/projects/spinoza/works/dpp-.mkd<CR>
nmap <leader><leader>D :e /Users/raf/projects/spinoza/works/dpp.mkd<CR>
nmap <leader><leader>j :e /Users/raf/projects/spinoza/works/letters-.mkd<CR>
nmap <leader><leader>J :e /Users/raf/projects/spinoza/works/letters.mkd<CR>

" Map <C-L> (redraw screen) to also turn off search highlighting until the
" next search
nnoremap <C-L> :nohl<CR><C-L>

" Prettier
nmap <leader>p :CocCommand prettier.forceFormatDocument<CR>


" Edit another file in the same directory as the current file
" uses expression to extract path from current file's path
" (thanks Douglas Potts).
" tip:
map <leader><leader><leader>p :e <C-R>=expand("%:p:h") . "/" <CR>

" Use zl to list buffers, and go to matching buffer
" tip:
nmap zl :ls!<CR>

" Indent in markdown
nmap <leader>> :s/^/> <CR>:nohl<CR>
nmap <leader>i :s/^/> <CR>:nohl<CR>
nmap <leader><TAB> :s/^/> <CR>:nohl<CR>

set relativenumber

" " Use K to show documentation in preview window.
" nnoremap <silent> K <cmd>lua vim.lsp.buf.hover()<CR>

"autocmd BufWritePre *.js lua vim.lsp.buf.formatting_sync(nil, 100)

let g:gruvbox_italic=1
let g:gruvbox_bold=0
"let g:airline_theme='gruvbox8'
set background=dark

" Add (Neo)Vim's native statusline support.
" NOTE: Please see `:h coc-status` for integrations with external plugins that
" provide custom statusline: lightline.vim, vim-airline.
"set statusline^=%{coc#status()}%{get(b:,'coc_current_function','')}

map <leader>f :MRU<CR>
map <leader>F :FZF<CR>
" to change what FZF does, change FZF_DEFAULT_COMMAND in .zshrc
map <leader>A :Ag<CR>
map <leader>P :Ag <c-r>"<CR>
map <leader>W :w!<CR>

set relativenumber

" Don't flag json comments as invalid syntax
autocmd FileType json syntax match Comment +\/\/.\+$+

nmap <leader>cl oconsole.log('<c-r>"', <c-r>");<esc>
nmap <leader><leader>l oconsole.log('<c-r>"', <c-r>");<esc>
nmap <leader>cL oconsole.log('<c-r>"', { ...<c-r>" });<esc> " tip
nmap <leader>Cl oql('<c-r>"', <c-r>"); // NO_COMMIT<esc>
nmap <leader>SD oscreen.debug(undefined, 999999);<esc>

nmap <leader><leader>1 :e /Users/raf/projects/spinoza/diss/chapters/scratch/1-aspects.mkd<CR>
nmap <leader><leader>2 :e /Users/raf/projects/spinoza/diss/chapters/scratch/2*.mkd<CR>
nmap <leader><leader>3 :e /Users/raf/projects/spinoza/diss/chapters/scratch/3*.mkd<CR>
nmap <leader><leader>4 :e /Users/raf/projects/spinoza/diss/chapters/scratch/4*.mkd<CR>
nmap <leader><leader>t :e /Users/raf/projects/spinoza/works/ttp-.mkd<CR>
nmap <leader><leader>T :e /Users/raf/projects/spinoza/works/ttp.mkd<CR>
nmap <leader><leader>i :e /users/raf/projects/spinoza/works/tie-.mkd<cr>
nmap <leader><leader>I :e /Users/raf/projects/spinoza/works/tie.mkd<CR>
nmap <leader><leader>p :e /users/raf/projects/spinoza/works/tp-.mkd<cr>
nmap <leader><leader>P :e /Users/raf/projects/spinoza/works/tp.mkd<CR>
nmap <leader><leader>k :e /Users/raf/projects/spinoza/works/kv-.mkd<CR>
nmap <leader><leader>K :e /Users/raf/projects/spinoza/works/kv.mkd<CR>
nmap <leader><leader>c :e /Users/raf/projects/spinoza/works/cm-.mkd<CR>
nmap <leader><leader>C :e /Users/raf/projects/spinoza/works/cm.mkd<CR>
nmap <leader><leader>d :e /Users/raf/projects/spinoza/works/dpp-.mkd<CR>
nmap <leader><leader>D :e /Users/raf/projects/spinoza/works/dpp.mkd<CR>
nmap <leader><leader>j :e /Users/raf/projects/spinoza/works/letters-.mkd<CR>
nmap <leader><leader>J :e /Users/raf/projects/spinoza/works/letters.mkd<CR>

autocmd FileType javascript,elixir   map <leader>n :ShowAutoLog<CR>
autocmd FileType javascript,elixir   map <leader>N :MarkLineToLog<CR>

map <leader>C :Codi<CR> " tip

" Identify what syntax highlighting group is used at the cursor
" h/t https://vim.fandom.com/wiki/Identify_the_syntax_highlighting_group_used_at_the_cursor
nnoremap <leader><leader>S :echo "hi<" . synIDattr(synID(line("."),col("."),1),"name") . '> trans<'
\ . synIDattr(synID(line("."),col("."),0),"name") . "> lo<"
\ . synIDattr(synIDtrans(synID(line("."),col("."),1)),"name") . ">"<CR>

""""""""""""""
" plug: vim-case-master
nnoremap ,K :CaseMasterRotateCase<CR> " tip
nnoremap ,? :CaseMasterRotateCase<CR> " tip
""""""""""""""

""""""""""""""
"" plug: breeze
""""""""""""""
"" jump to all visible opening tags after the cursor position
"nmap <space>j <Plug>(breeze-jump-tag-forward) " tip
"" jump to all visible opening tags before the cursor position
"nmap <space>J <Plug>(breeze-jump-tag-backward)
"
"" jump to all visible HTML attributes after the cursor position
"nmap <space>a <Plug>(breeze-jump-attribute-forward)
"" jump to all visible HTML attributes before the cursor position
"nmap <space>A <Plug>(breeze-jump-attribute-backward)

map <space>d :set background=dark<CR>
map <space>l :set background=light<CR>

nmap <leader><leader><leader>w :e /Users/raf/o/misc/writing.mkd<CR>
nmap <leader>M :e /Users/raf/o/Metaphor/metaphor.mkd<CR>
nmap <leader>b :e /Users/raf/o/Metaphor/bibliography.yaml<CR>
nmap <leader>D :e /Users/raf/o/proposal/desc.mkd<CR>

nmap <leader>` cs'` " tip
nmap <leader><leader>` cs'`cs"`
nmap CSS cs'"
nmap css cs"'

" TOOO: mark this as a tip
nmap <leader>= i() => {}<ESC>i

nmap <leader>PI :PlugInstall<CR>
nmap <leader>PC :PlugClean<CR>
nmap <leader>ps :PackerSync<CR>
nmap <leader>pi :PackerInstall<CR>

nmap \T :TroubleToggle<CR>

nmap <silent> <leader>t :TestNearest<CR>
nmap <silent> <leader>T :TestFile<CR>
nmap <silent> <leader>a :TestSuite<CR>
nmap <silent> <leader>l :TestLast<CR>
nmap <silent> <leader>g :TestVisit<CR>

" Smart replace, e.g., :Subvert/reason{ing}/intellect{ualizing}/g " tip

set incsearch
set ignorecase
set smartcase

" szw/vim-maximizer
nnoremap <silent> <C-w>m :MaximizerToggle!<CR>

" " janko/vim-test
" nnoremap <silent> tt :TestNearest<CR>
" nnoremap <silent> tf :TestFile<CR>
" nnoremap <silent> ts :TestSuite<CR>
" nnoremap <silent> t_ :TestLast<CR>
" let test#strategy = "neovim"
" let test#neovim#term_position = "vertical"
" let test#enabled_runners = ["javascript#jest"]
" let g:test#javascript#runner = 'jest'


"nnoremap <leader>dh :lua require'dap'.toggle_breakpoint()<CR>
"nnoremap <S-k> :lua require'dap'.step_out()<CR>
"nnoremap <S-l> :lua require'dap'.step_into()<CR>
"nnoremap <S-j> :lua require'dap'.step_over()<CR>
"nnoremap <leader>ds :lua require'dap'.stop()<CR>
"nnoremap <leader>dn :lua require'dap'.continue()<CR>
"nnoremap <leader>dk :lua require'dap'.up()<CR>
"nnoremap <leader>dj :lua require'dap'.down()<CR>
"nnoremap <leader>d_ :lua require'dap'.disconnect();require'dap'.stop();require'dap'.run_last()<CR>
"nnoremap <leader>dr :lua require'dap'.repl.open({}, 'vsplit')<CR><C-w>l
" perhaps need to implement david kunz's method depicted here https://youtu.be/ga3Cas7vNCk?t=128
"nnoremap <leader>di :lua require'dap.ui.variables'.hover()<CR>
"vnoremap <leader>di :lua require'dap.ui.variables'.visual_hover()<CR>
"nnoremap <leader>d? :lua require'dap.ui.variables'.scopes()<CR>
"nnoremap <leader>de :lua require'dap'.set_exception_breakpoints({"all"})<CR>
"nnoremap <leader>da :lua require'debugHelper'.attach()<CR>
"nnoremap <leader>dA :lua require'debugHelper'.attachToRemote()<CR>
"nnoremap <leader>di :lua require'dap.ui.widgets'.hover()<CR>
"nnoremap <leader>d? :lua local widgets=require'dap.ui.widgets';widgets.centered_float(widgets.scopes)<CR>

" theHamsta/nvim-dap-virtual-text and mfussenegger/nvim-dap
let g:dap_virtual_text = v:true

" Plug 'rcarriga/nvim-dap-ui'
" lua require("dapui").setup()
" nnoremap <leader>dq :lua require("dapui").toggle()<CR>

" jank/vim-test and mfussenegger/nvim-dap
"nnoremap <leader>dd :TestNearest -strategy=jest<CR>
"function! JestStrategy(cmd)
"  let testName = matchlist(a:cmd, '\v -t ''(.*)''')[1]
"  let fileName = matchlist(a:cmd, '\v'' -- (.*)$')[1]
"  call luaeval("require'debugHelper'.debugJest([remove_this_to_re_enable[" . testName . "]remove_this_to_re_enable], [remove_this_to_re_enable[" . fileName . "]remove_this_to_re_enable])")
"endfunction
"let g:test#custom_strategies = {'jest': function('JestStrategy')}
"
"" David-Kunz/jester
"nnoremap <leader>tt :lua require"jester".run()<cr>
"nnoremap <leader>t_ :lua require"jester".run_last()<cr>
"nnoremap <leader>tf :lua require"jester".run_file()<cr>
"nnoremap <leader>dd :lua require"jester".debug()<cr>
"nnoremap <leader>d_ :lua require"jester".debug_last()<cr>
"nnoremap <leader>dF :lua require"jester".debug_file()<cr>

set diffopt+=vertical " starts diff mode in vertical split
"set cmdheight=1 " only one line for commands
set shortmess+=c " don't need to press enter so often

" You have the alias `vimerge` for doing git merges " tip

""""""""""""""""""""""""""""""""""""
" For plugin vim-startify
" To make a line in this file a tip (a line that may appear in the startup
" screen, either add '" tip' to the end of the line, or precede it with '"
" tip:' in the previous line.
function! GetTips() abort
  let s:output1 = system("echo '' >> /tmp/vimtips")
  let s:output2 = system("cat $HOME/.vimrc | grep \" tip[ ]*$\" | sed \"s/. tip[ ]*$//\" | sed \"s/^\\\" //\" >> /tmp/vimtips")
  let s:output3 = system("cat $HOME/.vimrc | grep -A1 \"^. tip:\" | grep -v \"tip:\" >> /tmp/vimtips")
  let s:cmd = "echo \"Tip:\"; cat /tmp/vimtips | shuf -n 3"
  return split(system(s:cmd),"\n")
endfunction
let g:startify_custom_header = "startify#pad(GetTips())"

" returns all modified files of the current git repo
" `2>/dev/null` makes the command fail quietly, so that when we are not
" in a git repo, the list will be empty
function! s:gitModified()
    let files = systemlist('git ls-files -m 2>/dev/null')
    return map(files, "{'line': v:val, 'path': v:val}")
endfunction

" same as above, but show untracked files, honouring .gitignore
function! s:gitUntracked()
    let files = systemlist('git ls-files -o --exclude-standard 2>/dev/null')
    return map(files, "{'line': v:val, 'path': v:val}")
endfunction

let g:startify_lists = [
        \ { 'type': function('s:gitModified'),  'header': ['   git modified']},
        \ { 'type': function('s:gitUntracked'), 'header': ['   git untracked']},
        \ { 'type': 'files',     'header': ['   MRU']            },
        \ { 'type': 'dir',       'header': ['   MRU '. getcwd()] },
        \ { 'type': 'sessions',  'header': ['   Sessions']       },
        \ { 'type': 'bookmarks', 'header': ['   Bookmarks']      },
        \ { 'type': 'commands',  'header': ['   Commands']       },
        \ ]

" format json (this is an alternative to jq)
nnoremap ,js :%!python -m json.tool<CR>

]])


-- What follows is this init.lua: https://raw.githubusercontent.com/weakphish/dotfiles/master/.config/nvim/init.lua
------- if vim.g.vscode then
-------   -- VSCode extension
------- else
-------   -- ordinary Neovim
-------   -- Set <space> as the leader key
-------   -- See `:help mapleader`
-------   --  NOTE: Must happen before plugins are required (otherwise wrong leader will be used)
-------   vim.g.mapleader = ' '
-------   vim.g.maplocalleader = ' '
-------
-------   -- [[ Setting general options ]]
-------   -- Set highlight on search
-------   vim.o.hlsearch = false
-------
-------   -- Make line numbers default
-------   vim.wo.number = true
-------   vim.wo.relativenumber = true
-------
-------   -- Add a ruler (color column) at 120
-------   vim.opt.colorcolumn = '120'
-------
-------   -- Enable mouse mode
-------   vim.o.mouse = 'a'
-------
-------   -- Enable break indent
-------   vim.o.breakindent = true
-------
-------   -- Save undo history
-------   vim.o.undofile = true
-------
-------   -- Case insensitive searching UNLESS /C or capital in search
-------   vim.o.ignorecase = true
-------   vim.o.smartcase = true
-------
-------   -- Keep signcolumn on by default
-------   vim.wo.signcolumn = 'yes'
-------
-------   -- Decrease update time
-------   vim.o.updatetime = 250
-------   vim.o.timeout = true
-------   vim.o.timeoutlen = 300
-------
-------   -- Set completeopt to have a better completion experience
-------   vim.o.completeopt = 'menuone,noselect'
-------
-------   -- NOTE: You should make sure your terminal supports this
-------   vim.o.termguicolors = true
-------
-------   vim.o.guifont = 'JetBrains Mono:h14' -- text below applies for VimScript
-------
-------   -- [[ Basic Keymaps ]]
-------   -- Keymaps for better default experience
-------   -- See `:help vim.keymap.set()`
-------   vim.keymap.set({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })
-------
-------   -- Remap for dealing with word wrap
-------   vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
-------   vim.keymap.set('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })
-------
-------   -- [[ Highlight on yank ]]
-------   -- See `:help vim.highlight.on_yank()`
-------   local highlight_group = vim.api.nvim_create_augroup('YankHighlight', { clear = true })
-------   vim.api.nvim_create_autocmd('TextYankPost', {
-------     callback = function()
-------       vim.highlight.on_yank()
-------     end,
-------     group = highlight_group,
-------     pattern = '*',
-------   })
-------
-------   -- [[ Filetype Detection ]]
-------   -- Detect Jenkinsfile as a Groovy Filetype
-------   vim.filetype.add {
-------     filename = {
-------       ['Jenkinsfile'] = 'groovy',
-------       ['jenkinsfile'] = 'groovy',
-------     },
-------   }
-------
-------   -- Install package manager
-------   --    https://github.com/folke/lazy.nvim
-------   --    `:help lazy.nvim.txt` for more info
-------   local lazypath = vim.fn.stdpath 'data' .. '/lazy/lazy.nvim'
-------   if not vim.loop.fs_stat(lazypath) then
-------     vim.fn.system {
-------       'git',
-------       'clone',
-------       '--filter=blob:none',
-------       'https://github.com/folke/lazy.nvim.git',
-------       '--branch=stable', -- latest stable release
-------       lazypath,
-------     }
-------   end
-------   vim.opt.rtp:prepend(lazypath)
-------
-------   -- NOTE: Here is where you install your plugins.
-------   --  You can configure plugins using the `config` key.
-------   --  You can also configure plugins after the setup call,
-------   --    as they will be available in your neovim runtime.
-------   require('lazy').setup({
-------     -- NOTE: === LSP / COMPLETION ===
-------     {
-------       -- LSP Configuration & Plugins
-------       'neovim/nvim-lspconfig',
-------       opts = {
-------         inlay_hints = { enabled = true },
-------       },
-------       dependencies = {
-------         -- Automatically install LSPs to stdpath for neovim
-------         'williamboman/mason.nvim',
-------         'williamboman/mason-lspconfig.nvim',
-------
-------         -- Use non-LSP as an LSP (linters, etc)
-------         'nvimtools/none-ls.nvim',
-------
-------         -- Useful status updates for LSP
-------         -- NOTE: `opts = {}` is the same as calling `require('fidget').setup({})`
-------         { "j-hui/fidget.nvim", opts = {}, tag = 'legacy' },
-------
-------         -- Additional lua configuration, makes nvim stuff amazing!
-------         'folke/neodev.nvim',
-------       },
-------       config = function()
-------         --  This function gets run when an LSP connects to a particular buffer.
-------         local on_attach = function(client, bufnr)
-------           -- Show line diagnostics in hover window
-------           -- Source: https://github.com/neovim/nvim-lspconfig/wiki/UI-customization#show-line-diagnostics-automatically-in-hover-window
-------           vim.o.updatetime = 250
-------           vim.cmd [[autocmd! CursorHold,CursorHoldI * lua vim.diagnostic.open_float(nil, {focus=false})]]
-------           vim.api.nvim_create_autocmd('CursorHold', {
-------             buffer = bufnr,
-------             callback = function()
-------               local opts = {
-------                 focusable = false,
-------                 close_events = { 'BufLeave', 'CursorMoved', 'InsertEnter', 'FocusLost' },
-------                 border = 'rounded',
-------                 source = 'always',
-------                 prefix = ' ',
-------                 scope = 'cursor',
-------               }
-------               vim.diagnostic.open_float(nil, opts)
-------             end,
-------           })
-------         end
-------
-------         -- Enable the following language servers
-------         --  Feel free to add/remove any LSPs that you want here. They will automatically be installed.
-------         --  Add any additional override configuration in the following tables. They will be passed to
-------         --  the `settings` field of the server config. You must look up that documentation yourself.
-------         local servers = {
-------           clangd = {},
-------           gopls = {},
-------           pyright = {},
-------           ruff_lsp = {},
-------           rust_analyzer = {},
-------           tsserver = {},
-------           html = {},
-------           lua_ls = {
-------             Lua = {
-------               workspace = { checkThirdParty = false },
-------               telemetry = { enable = false },
-------             },
-------           },
-------         }
-------
-------         vim.keymap.set({ 'n' }, 'K', vim.lsp.buf.hover, { desc = 'Hover Documentation' })
-------         vim.keymap.set({ 'n' }, '<C-k>', vim.lsp.buf.signature_help, { desc = 'Signature Documentation' })
-------
-------         -- Add in specific instructions to integrate go.nvim with mason
-------         require('go').setup {
-------           lsp_cfg = false,
-------           -- other setups...
-------         }
-------         local cfg = require('go.lsp').config() -- config() return the go.nvim gopls setup
-------         require('lspconfig').gopls.setup(cfg)
-------
-------         -- Setup neovim lua configuration
-------         require('neodev').setup()
-------
-------         -- nvim-cmp supports additional completion capabilities, so broadcast that to servers
-------         local capabilities = vim.lsp.protocol.make_client_capabilities()
-------         capabilities = require('cmp_nvim_lsp').default_capabilities(capabilities)
-------
-------         -- Setup mason so it can manage external tooling
-------         require('mason').setup()
-------
-------         -- Ensure the servers above are installed
-------         local mason_lspconfig = require 'mason-lspconfig'
-------
-------         mason_lspconfig.setup {
-------           ensure_installed = vim.tbl_keys(servers),
-------           automatic_installation = true,
-------         }
-------
-------         mason_lspconfig.setup_handlers {
-------           function(server_name)
-------             require('lspconfig')[server_name].setup {
-------               capabilities = capabilities,
-------               on_attach = on_attach,
-------               settings = servers[server_name],
-------             }
-------           end,
-------         }
-------
-------         -- Null / None Setup
-------         local null_ls = require 'null-ls'
-------
-------         null_ls.setup {
-------           sources = {
-------             null_ls.builtins.diagnostics.eslint,
-------             -- null_ls.builtins.completion.spell,
-------           },
-------         }
-------
-------         -- nvim-cmp setup
-------         local cmp = require 'cmp'
-------         local luasnip = require 'luasnip'
-------
-------         luasnip.config.setup {}
-------         require('cmp_git').setup()
-------
-------         cmp.setup {
-------           snippet = {
-------             expand = function(args)
-------               luasnip.lsp_expand(args.body)
-------             end,
-------           },
-------           mapping = cmp.mapping.preset.insert {
-------             ['<C-d>'] = cmp.mapping.scroll_docs(-4),
-------             ['<C-f>'] = cmp.mapping.scroll_docs(4),
-------             ['<C-Space>'] = cmp.mapping.complete {},
-------             ['<CR>'] = cmp.mapping.confirm {
-------               behavior = cmp.ConfirmBehavior.Replace,
-------               select = true,
-------             },
-------             ['<Tab>'] = cmp.mapping(function(fallback)
-------               if cmp.visible() then
-------                 cmp.select_next_item()
-------               elseif luasnip.expand_or_jumpable() then
-------                 luasnip.expand_or_jump()
-------               else
-------                 fallback()
-------               end
-------             end, { 'i', 's' }),
-------             ['<S-Tab>'] = cmp.mapping(function(fallback)
-------               if cmp.visible() then
-------                 cmp.select_prev_item()
-------               elseif luasnip.jumpable(-1) then
-------                 luasnip.jump(-1)
-------               else
-------                 fallback()
-------               end
-------             end, { 'i', 's' }),
-------           },
-------           sources = {
-------             { name = 'nvim_lsp' },
-------             { name = 'luasnip' },
-------             { name = 'path' },
-------             { name = 'git' },
-------           },
-------         }
-------       end,
-------     },
-------
-------     {
-------       -- Autocompletion Engine
-------       'hrsh7th/nvim-cmp',
-------       dependencies = { 'hrsh7th/cmp-nvim-lsp', 'L3MON4D3/LuaSnip', 'saadparwaiz1/cmp_luasnip', 'hrsh7th/cmp-path', 'petertriho/cmp-git' },
-------     },
-------
-------     {
-------       -- Autopair
-------       'windwp/nvim-autopairs',
-------       event = 'InsertEnter',
-------       config = function()
-------         require('nvim-autopairs').setup {}
-------       end,
-------     },
-------
-------     {
-------       -- Auto tag closing
-------       'windwp/nvim-ts-autotag',
-------       config = function()
-------         require('nvim-ts-autotag').setup()
-------       end,
-------     },
-------
-------     {
-------       -- Formatting
-------       'stevearc/conform.nvim',
-------       opts = {},
-------       config = function()
-------         require('conform').setup {
-------           formatters_by_ft = {
-------             lua = { 'stylua' },
-------             -- Conform will run multiple formatters sequentially
-------             python = { 'isort', 'black', 'ruff_fix' },
-------             -- Use a sub-list to run only the first available formatter
-------             javascript = { { 'prettierd', 'prettier' } },
-------           },
-------           format_on_save = {
-------             -- These options will be passed to conform.format()
-------             timeout_ms = 500,
-------             lsp_fallback = true,
-------           },
-------         }
-------       end,
-------     },
-------
-------     {
-------       'github/copilot.vim',
-------       config = function()
-------         vim.g.copilot_no_tab_map = true
-------         vim.api.nvim_set_keymap('i', '<C-J>', 'copilot#Accept("<CR>")', { silent = true, expr = true })
-------       end,
-------     },
-------
-------     -- NOTE: === VISUAL / AESTHETIC ---
-------
-------     -- Highly experimental plugin that completely replaces the UI for messages, cmdline and the popupmenu.
-------     {
-------       'folke/noice.nvim',
-------       event = 'VeryLazy',
-------       opts = {
-------         -- add any options here
-------       },
-------       dependencies = {
-------         -- if you lazy-load any plugin below, make sure to add proper `module="..."` entries
-------         'MunifTanjim/nui.nvim',
-------         -- OPTIONAL:
-------         --   `nvim-notify` is only needed, if you want to use the notification view.
-------         --   If not available, we use `mini` as the fallback
-------         'rcarriga/nvim-notify',
-------       },
-------       config = function()
-------         require('noice').setup {
-------           lsp = {
-------             -- override markdown rendering so that **cmp** and other plugins use **Treesitter**
-------             override = {
-------               ['vim.lsp.util.convert_input_to_markdown_lines'] = true,
-------               ['vim.lsp.util.stylize_markdown'] = true,
-------               ['cmp.entry.get_documentation'] = true,
-------             },
-------           },
-------           -- you can enable a preset for easier configuration
-------           presets = {
-------             bottom_search = true, -- use a classic bottom cmdline for search
-------             command_palette = true, -- position the cmdline and popupmenu together
-------             long_message_to_split = true, -- long messages will be sent to a split
-------             inc_rename = false, -- enables an input dialog for inc-rename.nvim
-------             lsp_doc_border = true, -- add a border to hover docs and signature help
-------           },
-------         }
-------       end,
-------     },
-------
-------     -- Make things generally prettier
-------     {
-------       'stevearc/dressing.nvim',
-------       opts = {},
-------     },
-------
-------     -- Dashboard like Doom Emacs
-------     {
-------       'goolord/alpha-nvim',
-------       event = 'VimEnter',
-------       dependencies = { 'nvim-tree/nvim-web-devicons' },
-------       config = function()
-------         local alpha = require 'alpha'
-------         local dashboard = require 'alpha.themes.dashboard'
-------
-------         dashboard.section.header.val = 'weakphish'
-------         dashboard.section.buttons.val = {
-------           dashboard.button('e', '  New file', ':ene <BAR> startinsert <CR>'),
-------           dashboard.button('q', '  Quit NVIM', ':qa<CR>'),
-------         }
-------
-------         -- Read a fortune :)
-------         local handle = io.popen 'fortune'
-------         local fortune = handle:read '*a'
-------         handle:close()
-------         dashboard.section.footer.val = fortune
-------         alpha.setup(dashboard.opts)
-------       end,
-------     },
-------
-------     -- Pretty Icons
-------     'nvim-tree/nvim-web-devicons',
-------
-------     -- Highlight the current symbol in the buffer
-------     'RRethy/vim-illuminate',
-------
-------     -- Detect tabstop and shiftwidth automatically
-------     'tpope/vim-sleuth',
-------
-------     {
-------       -- Neotree - file tree browser
-------       'nvim-neo-tree/neo-tree.nvim',
-------       dependencies = {
-------         'nvim-lua/plenary.nvim',
-------         'nvim-tree/nvim-web-devicons', -- not strictly required, but recommended
-------         'MunifTanjim/nui.nvim',
-------       },
-------     },
-------
-------     {
-------       -- Document symbols
-------       'stevearc/aerial.nvim',
-------       config = function()
-------         require('aerial').setup()
-------       end,
-------     },
-------
-------     {
-------       -- Adds git releated signs to the gutter, as well as utilities for managing changes
-------       'lewis6991/gitsigns.nvim',
-------       config = function()
-------         require('gitsigns').setup()
-------       end,
-------     },
-------
-------     {
-------       -- Pretty colors
-------       'rebelot/kanagawa.nvim',
-------       priority = 1000,
-------       config = function()
-------         vim.cmd 'colorscheme kanagawa'
-------       end,
-------     },
-------
-------     {
-------       -- Set lualine as statusline
-------       'nvim-lualine/lualine.nvim',
-------       -- See `:help lualine.txt`
-------       opts = {
-------         options = {
-------           icons_enabled = false,
-------           theme = 'kanagawa',
-------           component_separators = '|',
-------           section_separators = '',
-------         },
-------       },
-------       config = function()
-------         require('lualine').setup { sections = { lualine_x = { 'aerial' } } }
-------       end,
-------     },
-------
-------     {
-------       -- Tabs, but less bad and more good
-------       'akinsho/bufferline.nvim',
-------       dependencies = 'nvim-tree/nvim-web-devicons',
-------       config = function()
-------         require('bufferline').setup {}
-------       end,
-------     },
-------     {
-------       'lukas-reineke/indent-blankline.nvim',
-------       main = 'ibl',
-------       opts = {},
-------       config = function()
-------         require('ibl').setup()
-------       end,
-------     },
-------
-------     -- NOTE: === LANGUAGE SUPPORT ===
-------     -- Linter for Jenkinsfiles
-------     {
-------       'ckipp01/nvim-jenkinsfile-linter',
-------       dependencies = { 'nvim-lua/plenary.nvim' },
-------     },
-------
-------     -- Extra Golang Goodies
-------     {
-------       'ray-x/go.nvim',
-------       dependencies = { -- optional packages
-------         'ray-x/guihua.lua',
-------         'neovim/nvim-lspconfig',
-------         'nvim-treesitter/nvim-treesitter',
-------       },
-------       config = function()
-------         require('go').setup()
-------       end,
-------       event = { 'CmdlineEnter' },
-------       ft = { 'go', 'gomod' },
-------       build = ':lua require("go.install").update_all_sync()', -- if you need to install/update all binaries
-------     },
-------
-------     -- NOTE: === MARKDOWN ===
-------     -- Markdown preview with Glow
-------     { 'ellisonleao/glow.nvim', config = true, cmd = 'Glow' },
-------
-------     {
-------       -- Zen mode for writing markdown
-------       'folke/zen-mode.nvim',
-------       config = function()
-------         require('zen-mode').setup {}
-------       end,
-------     },
-------
-------     {
-------       -- Dim inactive portions of code
-------       'folke/twilight.nvim',
-------       config = function()
-------         require('twilight').setup {}
-------       end,
-------     },
-------
-------     {
-------       -- Use wiki links in markdown
-------       'jakewvincent/mkdnflow.nvim',
-------       config = function()
-------         require('mkdnflow').setup()
-------       end,
-------     },
-------
-------     -- NOTE: === TOOLS ===
-------     {
-------       -- Obsidian in Neovim
-------       'epwalsh/obsidian.nvim',
-------       version = '*', -- recommended, use latest release instead of latest commit
-------       lazy = true,
-------       ft = 'markdown',
-------       -- Replace the above line with this if you only want to load obsidian.nvim for markdown files in your vault:
-------       -- event = {
-------       --   -- If you want to use the home shortcut '~' here you need to call 'vim.fn.expand'.
-------       --   -- E.g. "BufReadPre " .. vim.fn.expand "~" .. "/my-vault/**.md"
-------       --   "BufReadPre path/to/my-vault/**.md",
-------       --   "BufNewFile path/to/my-vault/**.md",
-------       -- },
-------       dependencies = {
-------         -- Required.
-------         'nvim-lua/plenary.nvim',
-------
-------         -- see below for full list of optional dependencies 👇
-------       },
-------       opts = {
-------         workspaces = {
-------           {
-------             name = 'work',
-------             path = '~/Obsidian',
-------           },
-------         },
-------       },
-------     },
-------
-------     {
-------       'ggandor/leap.nvim',
-------       dependencies = {
-------         'tpope/vim-repeat',
-------       },
-------       config = function()
-------         require('leap').add_default_mappings()
-------       end,
-------     },
-------
-------     {
-------       -- GitHub interactions
-------       'pwntester/octo.nvim',
-------       requires = {
-------         'nvim-lua/plenary.nvim',
-------         'nvim-telescope/telescope.nvim',
-------         'nvim-tree/nvim-web-devicons',
-------       },
-------       config = function()
-------         require('octo').setup()
-------       end,
-------     },
-------
-------     {
-------       -- Test interactions
-------       'nvim-neotest/neotest',
-------       dependencies = {
-------         'nvim-lua/plenary.nvim',
-------         'nvim-neotest/neotest-python',
-------         'antoinemadec/FixCursorHold.nvim',
-------       },
-------       config = function()
-------         require('neotest').setup {
-------           adapters = {
-------             require 'neotest-python' {
-------               dap = {
-------                 justMyCode = false,
-------                 console = 'integratedTerminal',
-------               },
-------               args = { '--log-level', 'DEBUG', '--quiet' },
-------               runner = 'pytest',
-------             },
-------           },
-------         }
-------       end,
-------     },
-------
-------     {
-------       'echasnovski/mini.surround',
-------       version = false,
-------       config = function()
-------         require('mini.surround').setup {
-------           mappings = {
-------             add = '', -- Add surrounding in Normal and Visual modes
-------             delete = '', -- Delete surrounding
-------             find = '', -- Find surrounding (to the right)
-------             find_left = '', -- Find surrounding (to the left)
-------             highlight = '', -- Highlight surrounding
-------             replace = '', -- Replace surrounding
-------             update_n_lines = '', -- Update `n_lines`
-------
-------             suffix_last = '', -- Suffix to search with "prev" method
-------             suffix_next = '', -- Suffix to search with "next" method
-------           },
-------         }
-------       end,
-------     },
-------
-------     -- Easy toggling of terminals
-------     { 'akinsho/toggleterm.nvim', version = '*', config = true },
-------
-------     -- Git Porcelain
-------     {
-------       'kdheepak/lazygit.nvim',
-------       -- optional for floating window border decoration
-------       dependencies = {
-------         'nvim-lua/plenary.nvim',
-------       },
-------     },
-------
-------     {
-------       -- "gc" to comment visual regions/lines
-------       'numToStr/Comment.nvim',
-------       opts = {
-------         toggler = {
-------           line = '<leader>cc',
-------           block = '<leader>cb',
-------         },
-------       },
-------     },
-------     {
-------       -- Fuzzy Finder (files, lsp, etc)
-------       'nvim-telescope/telescope.nvim',
-------       version = '*',
-------       dependencies = {
-------         'nvim-lua/plenary.nvim',
-------         'debugloop/telescope-undo.nvim',
-------       },
-------     },
-------
-------     -- Fuzzy Finder Algorithm which requires local dependencies to be built.
-------     -- Only load if `make` is available. Make sure you have the system
-------     -- requirements installed.
-------     {
-------       'nvim-telescope/telescope-fzf-native.nvim',
-------       -- NOTE: If you are having trouble with this installation,
-------       --       refer to the README for telescope-fzf-native for more instructions.
-------       build = 'make',
-------       cond = function()
-------         return vim.fn.executable 'make' == 1
-------       end,
-------     },
-------
-------     {
-------       -- DAP UI using Telescope
-------       'nvim-telescope/telescope-dap.nvim',
-------     },
-------
-------     {
-------       -- See local (adjacent) files
-------       'MaximilianLloyd/adjacent.nvim',
-------     },
-------
-------     {
-------       -- Highlight, edit, and navigate code
-------       'nvim-treesitter/nvim-treesitter',
-------       dependencies = {
-------         'nvim-treesitter/nvim-treesitter-textobjects',
-------       },
-------       config = function()
-------         vim.treesitter.language.register('markdown', 'octo')
-------
-------         pcall(require('nvim-treesitter.install').update { with_sync = true })
-------         -- See `:help telescope` and `:help telescope.setup()`
-------         require('telescope').setup {
-------           defaults = {
-------             mappings = {
-------               i = {
-------                 ['<C-u>'] = false,
-------                 ['<C-d>'] = false,
-------               },
-------             },
-------           },
-------         }
-------
-------         -- Enable telescope fzf native, if installed
-------         pcall(require('telescope').load_extension, 'fzf')
-------         -- Enable telescope dap if installed
-------         pcall(require('telescope').load_extension, 'dap')
-------         -- Enable telescope undo
-------         pcall(require('telescope').load_extension, 'undo')
-------         -- Enable telescope with Noice
-------         require('telescope').load_extension 'noice'
-------         -- Enable telescope with adjacanet
-------         require('telescope').load_extension 'adjacent'
-------
-------         -- [[ Configure Treesitter ]]
-------         -- See `:help nvim-treesitter`
-------         require('nvim-treesitter.configs').setup {
-------           -- Add languages to be installed here that you want installed for treesitter
-------           ensure_installed = {},
-------
-------           -- Autoinstall languages that are not installed. Defaults to false (but you can change for yourself!)
-------           auto_install = true,
-------
-------           highlight = { enable = true },
-------           indent = { enable = true, disable = { 'python' } },
-------           incremental_selection = {
-------             enable = true,
-------             keymaps = {
-------               init_selection = '<c-space>',
-------               node_incremental = '<c-space>',
-------               scope_incremental = '<c-s>',
-------               node_decremental = '<M-space>',
-------             },
-------           },
-------           textobjects = {
-------             select = {
-------               enable = true,
-------               lookahead = true, -- Automatically jump forward to textobj, similar to targets.vim
-------               keymaps = {
-------                 -- You can use the capture groups defined in textobjects.scm
-------                 ['aa'] = '@parameter.outer',
-------                 ['ia'] = '@parameter.inner',
-------                 ['af'] = '@function.outer',
-------                 ['if'] = '@function.inner',
-------                 ['ac'] = '@class.outer',
-------                 ['ic'] = '@class.inner',
-------               },
-------             },
-------             move = {
-------               enable = true,
-------               set_jumps = true, -- whether to set jumps in the jumplist
-------               goto_next_start = {
-------                 [']m'] = '@function.outer',
-------                 [']]'] = '@class.outer',
-------               },
-------               goto_next_end = {
-------                 [']M'] = '@function.outer',
-------                 [']['] = '@class.outer',
-------               },
-------               goto_previous_start = {
-------                 ['[m'] = '@function.outer',
-------                 ['[['] = '@class.outer',
-------               },
-------               goto_previous_end = {
-------                 ['[M'] = '@function.outer',
-------                 ['[]'] = '@class.outer',
-------               },
-------             },
-------             swap = {
-------               enable = true,
-------               swap_next = {
-------                 ['<leader>a'] = '@parameter.inner',
-------               },
-------               swap_previous = {
-------                 ['<leader>A'] = '@parameter.inner',
-------               },
-------             },
-------           },
-------         }
-------       end,
-------     },
-------     {
-------       -- Highlight / search TODO
-------       'folke/todo-comments.nvim',
-------       config = function()
-------         require('todo-comments').setup {}
-------       end,
-------     },
-------
-------     -- Search for Trouble ;)
-------     {
-------       'folke/trouble.nvim',
-------       dependencies = { 'nvim-tree/nvim-web-devicons' },
-------       opts = {},
-------     },
-------
-------     {
-------       -- Debugging??? In _MY_ Neovim??
-------       'mfussenegger/nvim-dap',
-------       dependencies = {
-------         -- Creates a beautiful debugger UI
-------         'rcarriga/nvim-dap-ui',
-------
-------         -- Installs the debug adapters for you
-------         'williamboman/mason.nvim',
-------         'jay-babu/mason-nvim-dap.nvim',
-------
-------         -- Add your own debuggers here
-------         'leoluz/nvim-dap-go',
-------         'mfussenegger/nvim-dap-python',
-------       },
-------       config = function()
-------         local dap = require 'dap'
-------         local dapui = require 'dapui'
-------         require('dap-go').setup()
-------         require('dap-python').setup '~/.virtualenvs/debugpy/bin/python'
-------
-------         require('mason-nvim-dap').setup {
-------           -- Makes a best effort to setup the various debuggers with
-------           -- reasonable debug configurations
-------           automatic_setup = true,
-------
-------           -- You'll need to check that you have the required things installed
-------           -- online, please don't ask me how to install them :)
-------           ensure_installed = {
-------             -- Update this to ensure that you have the debuggers for the langs you want
-------             'delve',
-------             'debugpy',
-------           },
-------         }
-------
-------         -- You can provide additional configuration to the handlers,
-------         -- see mason-nvim-dap README for more information
-------         require('mason-nvim-dap').setup()
-------
-------         -- Dap UI setup
-------         -- For more information, see |:help nvim-dap-ui|
-------         dapui.setup {
-------           -- Set icons to characters that are more likely to work in every terminal.
-------           --    Feel free to remove or use ones that you like more! :)
-------           --    Don't feel like these are good choices.
-------           icons = { expanded = '▾', collapsed = '▸', current_frame = '*' },
-------           controls = {
-------             icons = {
-------               pause = '⏸',
-------               play = '▶',
-------               step_into = '⏎',
-------               step_over = '⏭',
-------               step_out = '⏮',
-------               step_back = 'b',
-------               run_last = '▶▶',
-------               terminate = '⏹',
-------             },
-------           },
-------         }
-------
-------         dap.listeners.after.event_initialized['dapui_config'] = dapui.open
-------         dap.listeners.before.event_terminated['dapui_config'] = dapui.close
-------         dap.listeners.before.event_exited['dapui_config'] = dapui.close
-------       end,
-------     },
-------
-------     -- NOTE: === BINDINGS ===
-------     {
-------       -- Show key options when using shortcuts
-------       'folke/which-key.nvim',
-------       opts = {},
-------       config = function()
-------         local wk = require 'which-key'
-------         local dap = require 'dap'
-------         -- As an example, we will create the following mappings:
-------         wk.register({
-------           b = {
-------             name = 'Buffer',
-------             b = { require('telescope.builtin').buffers, 'Find Buffer' },
-------             d = { '<cmd>bd<CR>', 'Delete Buffer' },
-------             n = { '<cmd>bn<CR>', 'Next Buffer' },
-------             o = { '<cmd>BufferLinePick<CR>', 'Pick Buffer From Line' },
-------             p = { '<cmd>bp<CR>', 'Prev Buffer' },
-------           },
-------           c = {
-------             name = 'Code',
-------             a = { vim.lsp.buf.code_action, 'Code Action' },
-------             d = { vim.lsp.buf.definition, 'Go To Definition' },
-------             D = { vim.lsp.buf.declaration, 'Go to Declaration' },
-------             i = { vim.lsp.buf.implementation, 'Go to Implementation' },
-------             f = { require('conform').format, 'Format Buffer' },
-------             r = { vim.lsp.buf.rename, 'Code Rename' },
-------           },
-------           d = {
-------             name = 'Debug',
-------             b = { dap.toggle_breakpoint, 'Toggle breakpoint' },
-------             B = {
-------               function()
-------                 dap.set_breakpoint(vim.fn.input '[B]reakpoint condition: ')
-------               end,
-------               'Breakpoint condition',
-------             },
-------             c = { dap.continue, 'Continue' },
-------             i = { dap.step_into, 'Step into' },
-------             o = { dap.step_over, 'Step over' },
-------             u = { dap.step_out, 'Step up (out)' },
-------           },
-------           e = {
-------             name = 'Surround',
-------             a = { require('mini.surround').add, 'Add Surrounding' },
-------             d = { require('mini.surround').delete, 'Delete Surrounding' },
-------             f = { require('mini.surround').find, 'Find Surrounding Right' },
-------             F = { require('mini.surround').find_left, 'Find Surrounding Left' },
-------             h = { require('mini.surround').highlight, 'Highlight Surrounding' },
-------             r = { require('mini.surround').replace, 'Replace Surrounding' },
-------             n = { require('mini.surround').update_n_lines, 'Update Surrounding N Lines' },
-------           },
-------           f = {
-------             name = 'File',
-------             a = { '<cmd>Telescope adjacent<CR>', 'Addjacent Files' },
-------             f = { '<cmd>Telescope find_files hidden=true<cr>', 'Find File' },
-------             r = { '<cmd>Telescope oldfiles<cr>', 'Open Recent File' },
-------           },
-------           g = {
-------             name = 'Git',
-------             g = { '<cmd>LazyGit<CR>', 'LazyGit' },
-------             b = { '<cmd>Gitsigns toggle_current_line_blame<CR>', 'Current Line Blame' },
-------           },
-------           m = {
-------             name = 'Markdown',
-------             c = { '<cmd>Glow!<CR>', 'Close Preview' },
-------             f = { '<cmd>ZenMode<CR>', 'Focus' },
-------             m = { '<cmd>Glow<CR>', 'Open Preview' },
-------             t = { '<cmd>Twilight<CR>', 'Toggle Dim Inactive Code' },
-------           },
-------           n = {
-------             name = 'Neotest',
-------             r = {
-------               name = 'Run',
-------               f = { '<cmd>Neotest run file<CR>', 'Run File' },
-------             },
-------             s = { '<cmd>Neotest summary<CR>', 'Summary' },
-------             o = { '<cmd>Neotest output<CR>', 'Output' },
-------           },
-------           s = {
-------             name = 'Search',
-------             b = { require('telescope.builtin').current_buffer_fuzzy_find, 'Fuzzily search current buffer' },
-------             d = { require('telescope.builtin').diagnostics, 'Search Diagnostics' },
-------             g = { require('telescope.builtin').live_grep, 'Search with Grep' },
-------             h = { require('telescope.builtin').help_tags, 'Search Help' },
-------             r = { require('telescope.builtin').lsp_references, 'Search References' },
-------             s = { require('telescope.builtin').lsp_document_symbols, 'Workspace Document Symbols' },
-------             t = { '<cmd>TodoTelescope<CR>', 'Search TODO' },
-------             u = { '<cmd>Telescope undo<CR>', 'Search Undo' },
-------             w = { require('telescope.builtin').grep_string, 'Search current Word' },
-------           },
-------           t = {
-------             name = 'Toggle',
-------             a = { '<cmd>AerialToggle<CR>', 'Aerial' },
-------             b = { '<cmd>TroubleToggle<CR>', 'Trouble' },
-------             n = { '<cmd>NeoTreeShowToggle<CR>', 'NeoTree' },
-------             t = { '<cmd>:ToggleTerm size=40  direction=float<CR>', 'Floating Terminal' },
-------           },
-------           w = {
-------             name = 'Workspace',
-------             d = { require('telescope.builtin').diagnostics, 'Workspace Diagnostics' },
-------             s = { require('telescope.builtin').lsp_dynamic_workspace_symbols, 'Workspace Symbols' },
-------           },
-------         }, { prefix = '<leader>' })
-------       end,
-------     },
-------   }, {})
------- end
