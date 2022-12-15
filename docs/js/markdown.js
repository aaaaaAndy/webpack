var markdownConfig = {
  renderer: {
    code: function (code, lang) {
      var html = "";
      if (code.match(/^sequenceDiagram/) || code.match(/^graph/) || code.match(/^gantt/)) {
        html = '<div class="mermaid">' + code + "</div>";
      }
      var hl = Prism.highlight(code, Prism.languages[lang] || Prism.languages.markup);
      return (
        html +
        '<pre v-pre data-lang="' +
        lang +
        '" ' +
        'class="language-' +
        lang +
        '"><code class="language-' +
        lang +
        '">' +
        hl +
        "</code></pre>"
      );
    },
  },
};
