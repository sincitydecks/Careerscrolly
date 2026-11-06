import ast, pathlib, subprocess, tempfile
patch=pathlib.Path(__file__).parents[1]/'apply_to_careerscrolly.py'
mod=ast.parse(patch.read_text())
parts=[]
for node in ast.walk(mod):
    if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='change':
        arg=node.args[0]
        if isinstance(arg,ast.Constant) and isinstance(arg.value,str):
            parts.append(arg.value)
with tempfile.TemporaryDirectory() as d:
    filename=pathlib.Path(d)/'index.html'
    content='<!DOCTYPE html><html><head><style>\n'
    content+='\n'.join(p for p in parts if p.startswith('#rfds-app'))+'\n</style></head><body>\n'
    content+='function flightAwareAircraftUrl(flight) { return null; }\nfunction showFlightAwareFallback() { /* no-op */ }\nfunction showCustomLiveMap() {}\n'
    content+='function updateLiveRadar(flights) {\n'+'''    // Dynamic Icon Selection
    var isJet = false;
    var dProp = 'M0,0';
    var dJet = 'M0,0';
    path.setAttribute('d', isJet ? dJet : dProp);
    planeG.appendChild(path);
    g.appendChild(planeG);
'''+'}\n'
    content+='\n'.join(p for p in parts if not p.startswith('#rfds-app') and p != 'function updateLiveRadar(flights) {')
    filename.write_text(content)
    v=subprocess.run(['python',str(patch),str(filename)],capture_output=True,text=True)
    assert v.returncode==0, v.stdout+'\n'+v.stderr
    s=filename.read_text()
    for x in ['RFDS_NATIONAL_FIX_V3','function renderAircraftShape(',"KINGAIR", "renderAircraftShape(planeG, f);",'No approved RFDS aircraft']:
        assert x in s,x
    assert 'return type === \'PC12\' || type === \'PC24\'' not in s
    assert (filename.parent/'index.html.before-rfds-national.html').exists()
    print('PASS: patcher replaces current site fragments, keeps backup, injects all families')
