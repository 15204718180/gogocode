const scriptUtils = require('../utils/scriptUtils');

module.exports = function (ast, api, options) {
    // 迁移指南: https://v3.cn.vuejs.org/guide/migration/events-api.html

    let scriptAst = ast.parseOptions && ast.parseOptions.language == 'vue' ? ast.find('<script></script>') : ast
    if (scriptAst.length < 1) {
        return ast
    }
    let nodeStart = 0
    scriptAst.find([`$_$1.$on($_$2)`, `$_$1.$off($_$2)`, `$_$1.$once($_$2)`, `$_$1.$emit($_$2)`]).each(node => {
        let transform = false
        
        // xxx.$on() 情况处理
        if (node.attr('callee.object.name')) {
            let nodes = scriptAst.find([
                `import ${node.attr('callee.object.name')} from '$_$'`,
                `const ${node.attr('callee.object.name')} = $_$`,
                `let ${node.attr('callee.object.name')} = $_$`,
                `var ${node.attr('callee.object.name')} = $_$`,
            ])
            const tinyEmitter = `Object.assign(${node.attr('callee.object.name')} ,tiny_emitter_override);\n`
            // 查找eventhub定义
            nodes.each(hub => {
                let imports = scriptAst.find(`import '$_$'`)            
                if (hub.attr('type') == 'ImportDeclaration' && !scriptAst.has(tinyEmitter)) {
                    imports.eq(imports.length - 1).after(tinyEmitter)
                    transform = true
                }
                else if(!hub.parent(1).has(tinyEmitter)) {
                    hub.after(tinyEmitter)
                    transform = true
                }
            })
            // 没找到定义的情况 
            if (!nodes.length) {                
                if (!node.parent(1).has(tinyEmitter)) {
                    node.before(tinyEmitter)
                    transform = true
                }
            }
        }
        // this.xxx.$on() 情况处理
        else if (node.attr('callee.object.object.type') == 'ThisExpression' && node.attr('callee.object.property.name')) {
            const tinyEmitter = `Object.assign(this.${node.attr('callee.object.property.name')} ,tiny_emitter_override);\n`
            if (nodeStart != 0 && node.attr('start') < nodeStart) {
                scriptAst.remove(tinyEmitter)
            }
            if (!scriptAst.has(tinyEmitter)) {
                nodeStart = node.attr('start')
                node.before(tinyEmitter)
                transform = true
            }
        }
        // xxx.xxx.$on() 情况处理
        else if (node.attr('callee.object.object.type') == 'Identifier' && node.attr('callee.object.property.name')) {
            const tinyEmitter = `Object.assign(${node.attr('callee.object.object.name')}.${node.attr('callee.object.property.name')}, tiny_emitter_override);\n`
            if (!node.parent(1).has(tinyEmitter)) {
                node.before(tinyEmitter)
                transform = true
            }
        }

        
        // 转换后增加tiny-emitter引用
        if (transform) {
            try {
                const relativePath = scriptUtils.addUtils(
                    api.gogocode,
                    `import tiny_emitter from 'tiny-emitter/instance';
                    export default {
                      methods: {
                        vueOn: (...args) => tiny_emitter.on(...args),
                        vueOnce: (...args) => tiny_emitter.once(...args),
                        vueOff: (...args) => tiny_emitter.off(...args),
                        vueEmit: (...args) => tiny_emitter.emit(...args),
                      },
                    }
                    `, 
                    options.outRootPath, 
                    options.outFilePath, 
                    'tiny-emitter-bus.js'
                )               
                if (!scriptAst.has(`import TinyEmmitterBus from '${relativePath}'`)) {
                    scriptAst.before(`import TinyEmmitterBus from '${relativePath}';\n`)
                }
                scriptUtils.addMixin(scriptAst,'TinyEmmitterBus')
            }
            catch (ex) {
                console.log('writeFile error', ex)
            }           
        }
    })
       return ast
}