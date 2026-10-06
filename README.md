# shopify-section-schema-validator

A zero-dependency Node.js CLI that checks the `{% schema %}` tags in a Shopify theme's sections and blocks before you push them. A schema that will not parse, or that reuses a setting id, does not fail in your editor. It fails as a blank section in the theme editor, and the merchant finds it first.

Free and open source, MIT licensed. Need the storefront checked as well? [Run a free audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-section-schema-validator).

## Example output

Run against the included `examples/broken-theme`:

```
examples/broken-theme/sections/promo-banner.liquid
  line 7  error  name: name is 56 characters; the limit is 25.
  line 10  error  settings[1]: duplicate setting id "message".
  line 11  error  settings[2]: "select" needs a non-empty "options" array.
  line 12  error  settings[3]: "range" needs a numeric "step".
  line 13  warning  settings[4]: unrecognised setting type "colour"; check it against Shopify's setting type reference.
  line 17  error  blocks[1]: duplicate block type "link".
  line 20  warning  presets[0].settings: sets "mesage", which is not a setting on this section.

Checked 1 file(s): 5 error(s), 2 warning(s).
```

## What it checks

**Errors** (the command exits with code 1):

- The schema is valid JSON, and the file has at most one `{% schema %}` tag. Whitespace-control variants (`{%- schema -%}`) are recognised.
- The top-level `name` exists and is at most 25 characters, or is a translation object.
- `max_blocks`, when set, is a whole number from 0 to 50.
- Every setting has a `type`, and a unique `id` and `label`. `header` and `paragraph` need no id or label.
- `select` and `radio` settings have a non-empty `options` array. `range` settings have numeric `min`, `max` and `step`.
- Every block has a `type` and `name`, block types are unique within a section, and each block name is at most 25 characters. `@app` and `@theme` blocks are exempt from the name and uniqueness checks.
- Setting ids are unique within a section and within each block.
- A section has at most 50 blocks. Blocks with `"static": true` are not counted.
- Each preset has a `name`.

**Warnings** (reported, but they only fail the command with `--strict`):

- A setting type that is not in the snapshot list, which may be new or misspelled.
- A preset that sets a setting id which does not exist, or uses a block type that is not defined.

The limits and rules follow Shopify's [section schema reference](https://shopify.dev/docs/themes/architecture/sections/section-schema) and [numeric limits](https://shopify.dev/docs/storefronts/themes/architecture/limits) pages. Check those pages when Shopify changes them.

## Install

```bash
git clone https://github.com/Ecom-Swift-LLC/shopify-section-schema-validator.git
cd shopify-section-schema-validator
```

No dependencies to install. It uses only Node's built in `fs`, `path` and test runner. Requires Node 18 or later.

## Usage

Check a whole theme. The tool scans its `sections/` and `blocks/` folders:

```bash
node bin/validate.js path/to/theme
```

Check one file:

```bash
node bin/validate.js path/to/theme/sections/hero-banner.liquid
```

Options:

- `--json` prints a machine-readable report with `file`, `line`, `severity`, `path` and `message` for each issue.
- `--strict` makes warnings fail the run too, which suits CI.

Exit codes: `0` when clean, `1` when issues fail the run, `2` for a usage error.

### Run it in CI

```yaml
- name: Validate section schemas
  run: node path/to/shopify-section-schema-validator/bin/validate.js ./theme --strict
```

## Testing

```bash
npm test
```

The suite covers each rule above, with 21 tests. Each test is a small Liquid source string, so it is easy to add a case for a schema problem a merchant hit.

## What it does NOT do

- It does not check the Liquid outside `{% schema %}` tags. Use `shopify theme check` for that. This tool is meant to run alongside it, not replace it.
- It does not confirm that a setting you define is used in the template, or that a `section.settings.*` reference points at a real setting.
- It does not check translation keys, `locales/` files or `settings_data.json`.
- It does not render the theme or open the theme editor, so it cannot confirm how a section looks there.
- Its setting-type list is a snapshot of the documented types. A type Shopify adds later shows as a warning until the list is updated.
- It does not touch a live store or call any Shopify API.

## Related Shopify tools

- [shopify-liquid-linter](https://github.com/Ecom-Swift-LLC/shopify-liquid-linter): deprecated tags and filters, missing image alt text, and inline styles in Liquid files.
- [shopify-theme-deploy-action](https://github.com/Ecom-Swift-LLC/shopify-theme-deploy-action): a GitHub Action for pushing a theme from CI.
- [shopify-theme-performance-auditor](https://github.com/Ecom-Swift-LLC/shopify-theme-performance-auditor): static checks for theme assets that slow a page down.
- [shopify-accessible-components](https://github.com/Ecom-Swift-LLC/shopify-accessible-components): WCAG-conscious Liquid components for modals, drawers, tabs and filters.

## Contributing

Issues and pull requests are welcome, especially new rules backed by a link to Shopify's documentation. Every rule needs a test in `test/validate.test.js`. Bugs with a schema that fails for you but passes Shopify's editor are the most useful reports to file.

## Roadmap

- Check `{% schema %}` tags in `sections/` against the setting types of the current Shopify API version, with the list updated per release.
- Flag settings that are declared but never referenced in the file's Liquid.
- A `--fix` mode for simple cases, such as missing `label` text.

## License

MIT, © Ecom Swift LLC. See [LICENSE](LICENSE).

## Need help?

This project is maintained by **Ecom Swift LLC**, a Shopify Partner.

- 🛍️ Shopify Partner Directory: https://www.shopify.com/partners/directory/partner/waowy
- ✉️ Email: support@ecomswiftllc.com
- 💬 WhatsApp: https://wa.me/16312511767

Need a store checked end to end? The [free tools directory](https://www.ecomswiftllc.com/free-tools) lists everything we offer for free, and the [free audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-section-schema-validator) covers SEO, speed, conversion and AI visibility on your live store.

Ecom Swift LLC: https://www.ecomswiftllc.com
