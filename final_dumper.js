import 'frida-il2cpp-bridge';

// =====================================================================
// ⚙️ CONFIGURATION - CHANGE THESE VALUES
// =====================================================================
const TARGET_LIBRARY = "libcsharp.so"; // Change to "libil2cpp.so" for normal games
const OUTPUT_FILE = "/sdcard/Download/universal_dump.cs";

// =====================================================================
// 🚀 DUMPER LOGIC
// =====================================================================

globalThis.IL2CPP_MODULE_NAME = TARGET_LIBRARY;
Il2Cpp.$config.moduleName = TARGET_LIBRARY;

console.log(`[*] Universal Dumper loaded. Target: ${TARGET_LIBRARY}`);
console.log("[*] Waiting 20 seconds for the game to fully load...");

setTimeout(() => {
    Il2Cpp.perform(() => {
        console.log("[+] IL2CPP Engine initialized! Starting full dump...");

        let dumpContent = "// ==========================================\n";
        dumpContent += `// Universal IL2CPP Dump - Target: ${TARGET_LIBRARY}\n`;
        dumpContent += "// ==========================================\n\n";

        let classCount = 0;
        let methodCount = 0;
        let fieldCount = 0;
        let propertyCount = 0;

        function getClassModifier(cls) {
            try {
                if (cls.modifier) return cls.modifier;
                const flags = cls.flags;
                if (flags & 0x1) return "public";
                if (flags & 0x2) return "public"; 
                if (flags & 0x3) return "private"; 
                if (flags & 0x4) return "protected"; 
                if (flags & 0x5) return "internal"; 
                if (flags & 0x6) return "protected internal";
                if (flags & 0x7) return "private protected";
                return "internal";
            } catch (e) {
                return "public";
            }
        }

        try {
            // 1. Calculate total classes for the progress bar
            let totalClasses = 0;
            const assemblies = Il2Cpp.domain.assemblies;
            assemblies.forEach(assembly => {
                if (assembly.image && assembly.image.classes) {
                    totalClasses += assembly.image.classes.length;
                }
            });

            if (totalClasses === 0) {
                console.log("[-] No classes found. Is the game fully loaded?");
                return;
            }

            console.log(`[*] Found ${totalClasses} total classes. Starting dump...\n`);

            // 2. Iterate and Dump
            assemblies.forEach(assembly => {
                if (!assembly.image || !assembly.image.classes) return;
                
                const dllName = assembly.name || "UnknownDLL";

                assembly.image.classes.forEach(cls => {
                    try {
                        if (cls.name) {
                            // --- DLL Comment ---
                            dumpContent += `// DLL: ${dllName}\n`;

                            // --- Namespace ---
                            dumpContent += `namespace ${cls.namespace || ""}\n`;

                            // --- Class Declaration ---
                            let classDecl = `${getClassModifier(cls)} class ${cls.name}`;
                            if (cls.parent) {
                                classDecl += ` : ${cls.parent.name}`;
                            }
                            
                            let typeDefIndex = "";
                            if (cls.typeDefIndex !== undefined) {
                                typeDefIndex = ` // TypeDefIndex: ${cls.typeDefIndex}`;
                            }
                            
                            dumpContent += classDecl + typeDefIndex + "\n{\n";

                            // --- Fields Section ---
                            if (cls.fields && cls.fields.length > 0) {
                                dumpContent += "    // Fields\n";
                                cls.fields.forEach(field => {
                                    try {
                                        let fieldStr = "    ";
                                        if (field.modifier) fieldStr += field.modifier + " ";
                                        else fieldStr += "public ";
                                        if (field.isStatic) fieldStr += "static ";
                                        
                                        const fieldType = field.type ? field.type.name : "object";
                                        let offsetStr = "";
                                        if (field.offset !== undefined && field.offset !== null) {
                                            offsetStr = ` // 0x${field.offset.toString(16).toUpperCase()}`;
                                        }
                                        
                                        fieldStr += `${fieldType} ${field.name};${offsetStr}`;
                                        dumpContent += fieldStr + "\n";
                                        fieldCount++;
                                    } catch (e) {}
                                });
                                dumpContent += "\n";
                            }

                            // --- Properties & Methods Section ---
                            if (cls.methods && cls.methods.length > 0) {
                                const methodMap = {};
                                cls.methods.forEach(method => {
                                    try {
                                        if (!methodMap[method.name]) methodMap[method.name] = [];
                                        methodMap[method.name].push(method);
                                    } catch (e) {}
                                });

                                const processedProps = new Set();
                                let hasProperties = false;
                                let hasMethods = false;
                                let propertiesContent = "";
                                let methodsContent = "";

                                cls.methods.forEach(method => {
                                    try {
                                        const mName = method.name;
                                        
                                        // --- Property Detection ---
                                        if (mName.startsWith("get_") || mName.startsWith("set_")) {
                                            const propName = mName.substring(4);
                                            if (processedProps.has(propName)) return;
                                            processedProps.add(propName);

                                            const getter = methodMap["get_" + propName] ? methodMap["get_" + propName][0] : null;
                                            const setter = methodMap["set_" + propName] ? methodMap["set_" + propName][0] : null;

                                            if (getter || setter) {
                                                hasProperties = true;
                                                let propStr = "    ";
                                                if (getter && getter.modifier) propStr += getter.modifier + " ";
                                                else if (setter && setter.modifier) propStr += setter.modifier + " ";
                                                else propStr += "public ";
                                                
                                                const propType = getter && getter.returnType ? getter.returnType.name : "object";
                                                
                                                let braceContent = [];
                                                let commentOffsets = [];
                                                
                                                if (getter) {
                                                    let gRva = getter.relativeVirtualAddress ? "0x" + getter.relativeVirtualAddress.toString(16).toUpperCase() : "null";
                                                    braceContent.push(`get ${gRva};`);
                                                    let gComment = `Get: RVA ${gRva}`;
                                                    if (getter.offset) gComment += `, Offset: 0x${getter.offset.toString(16).toUpperCase()}`;
                                                    commentOffsets.push(gComment);
                                                }
                                                
                                                if (setter) {
                                                    let sRva = setter.relativeVirtualAddress ? "0x" + setter.relativeVirtualAddress.toString(16).toUpperCase() : "null";
                                                    braceContent.push(`set ${sRva};`);
                                                    let sComment = `Set: RVA ${sRva}`;
                                                    if (setter.offset) sComment += `, Offset: 0x${setter.offset.toString(16).toUpperCase()}`;
                                                    commentOffsets.push(sComment);
                                                }

                                                propStr += `${propType} ${propName} { ${braceContent.join(" ")} }`;
                                                
                                                if (commentOffsets.length > 0) {
                                                    propStr += ` // ${commentOffsets.join(" | ")}`;
                                                }

                                                propertiesContent += propStr + "\n";
                                                propertyCount++;
                                                return;
                                            }
                                        }

                                        // --- Normal Method Output ---
                                        hasMethods = true;
                                        let methodStr = "    ";
                                        if (method.modifier) methodStr += method.modifier + " ";
                                        else methodStr += "public ";
                                        
                                        if (method.isStatic) methodStr += "static ";
                                        if (method.isVirtual) methodStr += "virtual ";
                                        
                                        const returnType = method.returnType ? method.returnType.name : "void";
                                        let params = [];
                                        if (method.parameters) {
                                            method.parameters.forEach(param => {
                                                params.push(`${param.type.name} ${param.name}`);
                                            });
                                        }
                                        methodStr += `${returnType} ${method.name}(${params.join(", ")}) { }`;

                                        let rvaStr = "";
                                        try {
                                            const rva = method.relativeVirtualAddress;
                                            const va = method.virtualAddress;
                                            const offset = method.offset;
                                            if (rva) rvaStr += ` // RVA: 0x${rva.toString(16).toUpperCase()}`;
                                            if (offset) rvaStr += ` Offset: 0x${offset.toString(16).toUpperCase()}`;
                                            if (va) rvaStr += ` VA: 0x${va.toString(16).toUpperCase()}`;
                                            if (method.slot !== undefined) rvaStr += ` Slot: ${method.slot}`;
                                        } catch (e) {}
                                        
                                        methodsContent += methodStr + rvaStr + "\n";
                                        methodCount++;
                                    } catch (e) {}
                                });

                                if (hasProperties) {
                                    dumpContent += "    // Properties\n" + propertiesContent + "\n";
                                }
                                if (hasMethods) {
                                    dumpContent += "    // Methods\n" + methodsContent;
                                }
                            }

                            dumpContent += "}\n\n"; // End class
                        }
                    } catch (e) {
                        console.log(`\n[-] Error processing class: ${e}`);
                    }
                    
                    // --- UPDATE PROGRESS BAR (SAFELY) ---
                    classCount++;
                    if (classCount % Math.max(1, Math.floor(totalClasses / 100)) === 0 || classCount === totalClasses) {
                        // Clamp the ratio so we never go above 100%
                        const ratio = Math.min(classCount / totalClasses, 1.0);
                        const percent = Math.floor(ratio * 100);
                        
                        const barLength = 30;
                        // Ensure filled and empty are never negative
                        const filled = Math.max(0, Math.min(barLength, Math.floor(ratio * barLength)));
                        const empty = Math.max(0, barLength - filled);
                        
                        const bar = "█".repeat(filled) + "░".repeat(empty);
                        console.log(`\r[${bar}] ${percent}% (${classCount}/${totalClasses})`);
                    }
                });
            });

            // Write to file
            const file = new File(OUTPUT_FILE, "w");
            file.write(dumpContent);
            file.flush();
            file.close();

            console.log(`\n\n[+] SUCCESS!`);
            console.log(`[+] Dumped ${classCount} classes, ${propertyCount} properties, ${methodCount} methods, ${fieldCount} fields.`);
            console.log(`[+] File saved to: ${OUTPUT_FILE}`);

        } catch (e) {
            console.log("\n[-] Fatal error during dump: " + e);
        }
    });
}, 20000);