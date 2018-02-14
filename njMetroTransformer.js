'use strict';

const nj = require('nornj').default;
const includeParser = require('nornj/tools/includeParser');
const njUtils = require('nornj/tools/utils');
const semver = require('semver');
const reactNativeVersionString = require('react-native/package.json').version;
const reactNativeMinorVersion = semver(reactNativeVersionString).minor;

let upstreamTransformer = null;
if (reactNativeMinorVersion >= 52) {
  upstreamTransformer = require('metro/src/transformer')
} else if (reactNativeMinorVersion >= 47) {
  upstreamTransformer = require('metro-bundler/src/transformer')
} else if (reactNativeMinorVersion === 46) {
  upstreamTransformer = require('metro-bundler/build/transformer')
} else {
  // handle RN <= 0.45
  const oldUpstreamTransformer = require('react-native/packager/transformer')
  upstreamTransformer = {
    transform({ src, filename, options }) {
      return oldUpstreamTransformer.transform(src, filename, options)
    },
  }
}

function buildTmplFns(fns, tmplKey) {
  var ret = '{\n';
  ret += '  _njTmplKey: ' + tmplKey + ',\n';

  nj.each(fns, function(v, k, i, l) {
    if (k.indexOf('_') != 0) {
      ret += '  ' + k + ': ' + v.toString() + (i < l - 1 ? ',' : '') + '\n';
    }
  });

  return ret + '}';
}

function buildTemplateSource(source, filepath, options) {
  //Create delimiter rule of templates
  const delimiters = options.delimiters;

  let tmplRule = nj.tmplRule;
  if (delimiters != null) {
    if (nj.isString(delimiters) && delimiters.toLowerCase() === 'react') {
      tmplRule = nj.createTmplRule({
        start: '{',
        end: '}',
        comment: ''
      });
    } else {
      tmplRule = nj.createTmplRule(delimiters);
    }
  }

  //Set configs for extension tags and filters
  if (options.extensionConfig) {
    const extensionConfig = {};
    nj.each(options.extensionConfig, function(v, k) {
      extensionConfig[k] = {
        options: v
      };
    });

    nj.registerExtension(extensionConfig);
  }
  if (options.filterConfig) {
    const filterConfig = {};
    nj.each(options.filterConfig, function(v, k) {
      filterConfig[k] = {
        options: v
      };
    });

    nj.registerFilter(filterConfig);
  }

  //Parse the "include" and "template" block
  let tmpls = includeParser(source, filepath, tmplRule, true),
    tmplNames = Object.keys(tmpls),
    output = '';

  //Precompiling template
  if (tmplNames.length == 1 && tmplNames[0] === 'main') {
    if (tmpls.main.trim().length > 0) {
      var tmplKey = njUtils.uniqueKey(tmpls.main);
      output += 'nj.compileH(' + buildTmplFns(nj.precompile(tmpls.main, true, tmplRule), tmplKey) + ');';
    }
  } else {
    //Output multiple templates
    var tmplsStr = '';
    nj.each(tmpls, function(tmpl, name, i, l) {
      if (tmpl.trim().length > 0) {
        var _tmplKey = njUtils.uniqueKey(tmpl);
        tmplsStr += '  ' + name + ': ';
        tmplsStr += 'nj.compileH(' + buildTmplFns(nj.precompile(tmpl, true, tmplRule), _tmplKey) + ')';
        tmplsStr += (i < l - 1 ? ',' : '') + '\n';
      }
    });
    output += `{\n${tmplsStr}};`;
  }

  return output;
};

function createTransform(njOptions) {
  return function transform(src, filename, options) {
    if (typeof src === "object") {
      // handle RN >= 0.46
      ({ src, filename, options } = src);
    }

    if (filename.endsWith('htm') ||
      filename.endsWith('nj') ||
      filename.endsWith('nornj')) {
      return upstreamTransformer.transform({
        src: "module.exports = " + buildTemplateSource(src, filename, njOptions),
        filename,
        options
      });
    } else {
      return upstreamTransformer.transform({ src, filename, options });
    }
  };
}

module.exports.transform = createTransform({ delimiters: 'react' });
module.exports.createTransform = createTransform;