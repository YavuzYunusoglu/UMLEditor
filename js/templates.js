'use strict';
/* Palet öğeleri: temel şekiller, Unity sınıfları, Unity desenleri ve Unity akışları */
(function (global) {
  const App = (global.App = global.App || {});
  const $t = App.$t || ((k) => k);
  const SH = App.UML.SHAPES;
  const U = App.U;

  /* ---- Yardımcılar ---- */
  function cls(id, x, y, props) {
    return Object.assign({ id, type: 'class', x, y, name: $t('Sinif'), stereotype: '', namespace: '', abstract: false, attributes: '', methods: '', showMembers: true, w: 0 }, props);
  }
  function single(node) { return { nodes: [Object.assign({ id: 'a', x: 0, y: 0 }, node)], edges: [] }; }
  function shape(type, extra) {
    const m = SH[type];
    return () => single(Object.assign({ type, w: m.w, h: m.h, text: type === 'connector' ? '' : (type === 'frame' ? $t('Grup') : m.label) }, extra || {}));
  }
  function classItem(props) { return () => single(cls('a', 0, 0, props)); }

  /* Akış parçacığı: düğümler (col,row) ızgarasında merkezlenir */
  const CW = 230, RH = 115;
  function flow(spec) {
    return () => {
      const nodes = spec.nodes.map(([id, type, col, row, text, extra]) => {
        const m = SH[type];
        const w = (extra && extra.w) || m.w, h = (extra && extra.h) || m.h;
        return Object.assign({ id, type, x: Math.round(col * CW - w / 2), y: Math.round(row * RH - h / 2), w, h, text }, extra || {});
      });
      const edges = spec.edges.map(([from, to, label, fromSide, toSide], i) => {
        const e = { id: 'e' + i, from, to, type: 'flow', label: label || '' };
        if (fromSide) e.fromSide = fromSide;
        if (toSide) e.toSide = toSide;
        return e;
      });
      return { nodes, edges };
    };
  }
  const UNITY = '#4f8cff';
  const YES = $t('Evet'), NO = $t('Hayır'), LOOP_DONE = $t('Döngü bitti');

  const items = [];
  const add = (section, id, label, build, extra) => items.push(Object.assign({ section, id, label, build }, extra || {}));

  /* ---------------- UML ---------------- */
  add('uml', 'class', $t('Sınıf'), classItem({ name: $t('Sinif'), attributes: $t('- alan : int'), methods: $t('+ Metot() : void') }), { icon: 'class' });
  add('uml', 'abstract', $t('Soyut Sınıf'), classItem({ name: $t('SoyutSinif'), abstract: true, attributes: $t('# deger : int'), methods: $t('+ {abstract} Calistir() : void') }), { icon: 'class', color: '#8e9bb0' });
  add('uml', 'interface', $t('Arayüz'), classItem({ name: $t('IArayuz'), stereotype: 'interface', methods: $t('+ Metot() : void') }), { icon: 'class', color: '#3ecf8e' });
  add('uml', 'enum', 'Enum', classItem({ name: $t('Durum'), stereotype: 'enum', attributes: $t('Birinci\nIkinci\nUcuncu') }), { icon: 'class', color: '#f5a623' });
  add('uml', 'struct', 'Struct', classItem({ name: $t('Veri'), stereotype: 'struct', attributes: $t('+ deger : float') }), { icon: 'class', color: '#2bc0d6' });
  add('uml', 'note', $t('Not'), shape('note', { text: $t('Not yazın…') }), { icon: 'note' });
  add('uml', 'frame', $t('Grup / Paket'), shape('frame', { text: $t('Paket') }), { icon: 'frame' });

  /* ---------------- Akış ---------------- */
  add('flow', 'terminator', $t('Başla / Bitir'), shape('terminator', { text: $t('Başla') }), { icon: 'terminator' });
  add('flow', 'process', $t('İşlem'), shape('process'), { icon: 'process' });
  add('flow', 'decision', $t('Karar'), shape('decision', { text: $t('Koşul?') }), { icon: 'decision' });
  add('flow', 'io', $t('Girdi / Çıktı'), shape('io'), { icon: 'io' });
  add('flow', 'preparation', $t('Döngü (Hazırlık)'), shape('preparation', { text: 'for i = 0..n' }), { icon: 'preparation' });
  add('flow', 'subprocess', $t('Alt Süreç'), shape('subprocess'), { icon: 'subprocess' });
  add('flow', 'document', $t('Doküman'), shape('document'), { icon: 'document' });
  add('flow', 'connector', $t('Bağlayıcı'), shape('connector', { text: 'A' }), { icon: 'connector' });
  add('flow', 'text', $t('Metin'), shape('text', { text: $t('Metin') }), { icon: 'text' });
  add('flow', 'unitymsg', $t('Unity Mesajı'), shape('terminator', { text: 'Update()', color: UNITY }), { icon: 'terminator', color: UNITY });

  /* ---------------- Unity sınıfları ---------------- */
  add('unity', 'mono', 'MonoBehaviour', classItem({
    name: 'PlayerController', stereotype: 'MonoBehaviour',
    attributes: '- speed : float = 5f\n- rb : Rigidbody',
    methods: '- Awake() : void\n- Update() : void\n- FixedUpdate() : void',
  }), { icon: 'class', color: '#4f8cff' });
  add('unity', 'so', 'ScriptableObject', classItem({
    name: 'ItemData', stereotype: 'ScriptableObject',
    attributes: '+ itemName : string\n+ icon : Sprite\n+ value : int = 10\n+ prefab : GameObject',
  }), { icon: 'class', color: '#b26bff' });
  add('unity', 'singleton', 'Singleton Manager', classItem({
    name: 'GameManager', stereotype: 'MonoBehaviour',
    attributes: '+ {static} Instance : GameManager {get; private set;}',
    methods: '- Awake() : void',
  }), { icon: 'class', color: '#4f8cff' });
  add('unity', 'serializable', $t('[Serializable] Sınıf'), classItem({
    name: 'SaveData', stereotype: 'Serializable',
    attributes: '+ level : int\n+ playerPosition : Vector3\n+ inventory : List<string>',
  }), { icon: 'class', color: '#d4a35a' });
  add('unity', 'idamageable', 'IDamageable', classItem({
    name: 'IDamageable', stereotype: 'interface', methods: '+ TakeDamage(amount : float) : void',
  }), { icon: 'class', color: '#3ecf8e' });
  add('unity', 'gamestate', 'Enum (GameState)', classItem({
    name: 'GameState', stereotype: 'enum', attributes: 'MainMenu\nPlaying\nPaused\nGameOver',
  }), { icon: 'class', color: '#f5a623' });
  add('unity', 'abstractbase', $t('Soyut Temel Sınıf'), classItem({
    name: 'Weapon', stereotype: 'MonoBehaviour', abstract: true,
    attributes: '# damage : float = 10f\n# fireRate : float = 0.5f',
    methods: '+ {abstract} Fire() : void\n# {virtual} Reload() : void',
  }), { icon: 'class', color: '#4f8cff' });
  add('unity', 'editor', 'Custom Editor', classItem({
    name: 'PlayerControllerEditor', stereotype: 'Editor', methods: '+ {override} OnInspectorGUI() : void',
  }), { icon: 'class', color: '#ff6b6b' });
  add('unity', 'editorwindow', 'EditorWindow', classItem({
    name: 'LevelEditorWindow', stereotype: 'EditorWindow', methods: '- {static} ShowWindow() : void\n- OnGUI() : void',
  }), { icon: 'class', color: '#ff6b6b' });
  add('unity', 'static', $t('Statik Yardımcı'), classItem({
    name: 'MathUtils', stereotype: 'static', methods: '+ {static} Remap(value : float, from : float, to : float) : float',
  }), { icon: 'class', color: '#8e9bb0' });
  add('unity', 'smb', 'StateMachineBehaviour', classItem({
    name: 'AttackState', stereotype: 'StateMachineBehaviour',
    methods: '+ {override} OnStateEnter(animator : Animator, stateInfo : AnimatorStateInfo, layerIndex : int) : void\n+ {override} OnStateExit(animator : Animator, stateInfo : AnimatorStateInfo, layerIndex : int) : void',
  }), { icon: 'class', color: '#7b8cff' });

  /* ---------------- Unity desenleri ---------------- */
  add('patterns', 'statepattern', 'State Pattern', () => ({
    nodes: [
      cls('istate', 300, 0, { name: 'IState', stereotype: 'interface', methods: '+ Enter() : void\n+ Tick() : void\n+ Exit() : void' }),
      cls('sm', 0, 0, { name: 'StateMachine', attributes: '- currentState : IState', methods: '+ ChangeState(newState : IState) : void\n+ Tick() : void' }),
      cls('enemy', 0, 200, { name: 'Enemy', stereotype: 'MonoBehaviour', attributes: '- stateMachine : StateMachine', methods: '- Awake() : void\n- Update() : void' }),
      cls('idle', 220, 230, { name: 'IdleState', methods: '+ Enter() : void\n+ Tick() : void\n+ Exit() : void' }),
      cls('chase', 440, 230, { name: 'ChaseState', methods: '+ Enter() : void\n+ Tick() : void\n+ Exit() : void' }),
    ],
    edges: [
      { id: 'e1', from: 'sm', to: 'istate', type: 'association', label: '', dstLabel: '1' },
      { id: 'e2', from: 'enemy', to: 'sm', type: 'composition', label: '' },
      { id: 'e3', from: 'idle', to: 'istate', type: 'realization', label: '' },
      { id: 'e4', from: 'chase', to: 'istate', type: 'realization', label: '' },
    ],
    layout: true,
  }), { icon: 'pattern' });
  add('patterns', 'observer', 'Observer / Event', () => ({
    nodes: [
      cls('health', 0, 0, { name: 'Health', stereotype: 'MonoBehaviour', attributes: '- maxHealth : float = 100f\n- current : float\n+ OnHealthChanged : event Action<float>\n+ onDied : UnityEvent', methods: '+ TakeDamage(amount : float) : void\n- Die() : void' }),
      cls('ui', 360, 0, { name: 'HealthBarUI', stereotype: 'MonoBehaviour', attributes: '- health : Health\n- fill : Image', methods: '- OnEnable() : void\n- OnDisable() : void\n- UpdateBar(value : float) : void' }),
      cls('audio', 360, 200, { name: 'HitSound', stereotype: 'MonoBehaviour', attributes: '- health : Health\n- clip : AudioClip', methods: '- OnEnable() : void\n- OnDisable() : void' }),
    ],
    edges: [
      { id: 'e1', from: 'ui', to: 'health', type: 'dependency', label: $t('abone olur') },
      { id: 'e2', from: 'audio', to: 'health', type: 'dependency', label: $t('abone olur') },
    ],
  }), { icon: 'pattern' });
  add('patterns', 'pool', 'Object Pool', () => ({
    nodes: [
      cls('pool', 0, 0, { name: 'BulletPool', stereotype: 'MonoBehaviour', attributes: '- prefab : Bullet\n- initialSize : int = 20\n- pool : Queue<Bullet>', methods: '+ Get() : Bullet\n+ Release(bullet : Bullet) : void' }),
      cls('bullet', 380, 0, { name: 'Bullet', stereotype: 'MonoBehaviour', attributes: '- speed : float = 20f\n- lifeTime : float = 2f', methods: '- OnEnable() : void\n- Update() : void' }),
      cls('gun', 0, 220, { name: 'Gun', stereotype: 'MonoBehaviour', attributes: '- pool : BulletPool\n- muzzle : Transform', methods: '+ Shoot() : void' }),
    ],
    edges: [
      { id: 'e1', from: 'pool', to: 'bullet', type: 'aggregation', label: '', dstLabel: '*' },
      { id: 'e2', from: 'gun', to: 'pool', type: 'association', label: $t('kullanır') },
    ],
  }), { icon: 'pattern' });
  add('patterns', 'sodata', $t('ScriptableObject Veri'), () => ({
    nodes: [
      cls('wd', 380, 0, { name: 'WeaponData', stereotype: 'ScriptableObject', attributes: '+ weaponName : string\n+ damage : float = 10f\n+ fireRate : float = 0.2f\n+ projectile : GameObject' }),
      cls('w', 0, 0, { name: 'Weapon', stereotype: 'MonoBehaviour', attributes: '- data : WeaponData\n- nextFireTime : float', methods: '+ Fire() : void' }),
      cls('inv', 0, 200, { name: 'Inventory', stereotype: 'MonoBehaviour', attributes: '- weapons : List<WeaponData>', methods: '+ Equip(index : int) : void' }),
    ],
    edges: [
      { id: 'e1', from: 'w', to: 'wd', type: 'association', label: $t('veri') },
      { id: 'e2', from: 'inv', to: 'wd', type: 'aggregation', label: '', dstLabel: '*' },
    ],
  }), { icon: 'pattern' });
  add('patterns', 'managers', $t('Manager Yapısı'), () => ({
    nodes: [
      cls('gm', 160, 0, { name: 'GameManager', stereotype: 'MonoBehaviour', attributes: '+ {static} Instance : GameManager {get; private set;}\n+ State : GameState {get; private set;}', methods: '- Awake() : void\n+ ChangeState(newState : GameState) : void' }),
      cls('gs', 560, 0, { name: 'GameState', stereotype: 'enum', attributes: 'MainMenu\nPlaying\nPaused\nGameOver' }),
      cls('am', 0, 240, { name: 'AudioManager', stereotype: 'MonoBehaviour', methods: '+ PlaySfx(clip : AudioClip) : void\n+ PlayMusic(clip : AudioClip) : void' }),
      cls('ui', 330, 240, { name: 'UIManager', stereotype: 'MonoBehaviour', methods: '+ ShowPanel(name : string) : void' }),
    ],
    edges: [
      { id: 'e1', from: 'gm', to: 'gs', type: 'association', label: '' },
      { id: 'e2', from: 'gm', to: 'am', type: 'association', label: '' },
      { id: 'e3', from: 'gm', to: 'ui', type: 'association', label: '' },
    ],
  }), { icon: 'pattern' });
  add('patterns', 'command', 'Command Pattern', () => ({
    nodes: [
      cls('ic', 340, 0, { name: 'ICommand', stereotype: 'interface', methods: '+ Execute() : void\n+ Undo() : void' }),
      cls('inv', 0, 0, { name: 'CommandInvoker', attributes: '- history : Stack<ICommand>', methods: '+ Run(command : ICommand) : void\n+ UndoLast() : void' }),
      cls('mv', 230, 200, { name: 'MoveCommand', attributes: '- unit : Transform\n- delta : Vector3', methods: '+ Execute() : void\n+ Undo() : void' }),
      cls('at', 500, 200, { name: 'AttackCommand', attributes: '- target : IDamageable', methods: '+ Execute() : void\n+ Undo() : void' }),
    ],
    edges: [
      { id: 'e1', from: 'inv', to: 'ic', type: 'aggregation', label: '', dstLabel: '*' },
      { id: 'e2', from: 'mv', to: 'ic', type: 'realization' },
      { id: 'e3', from: 'at', to: 'ic', type: 'realization' },
    ],
  }), { icon: 'pattern' });

  /* ---------------- Unity akışları ---------------- */
  add('unityflow', 'lifecycle', $t('MonoBehaviour Yaşam Döngüsü'), flow({
    nodes: [
      ['aw', 'terminator', 0, 0, 'Awake()', { color: UNITY }],
      ['en', 'process', 0, 1, 'OnEnable()'],
      ['st', 'process', 0, 2, 'Start()'],
      ['fu', 'preparation', 0, 3, $t('FixedUpdate()\n(fizik adımı)')],
      ['tr', 'subprocess', 1, 3, $t('OnTrigger / OnCollision\nolayları')],
      ['up', 'process', 0, 4, 'Update()'],
      ['co', 'subprocess', 1, 4, $t('Coroutine\'ler\n(yield)')],
      ['lu', 'process', 0, 5, 'LateUpdate()'],
      ['dq', 'decision', 0, 6, $t('Obje devre dışı /\nyok edildi mi?')],
      ['di', 'process', 0, 7, 'OnDisable()'],
      ['de', 'terminator', 0, 8, 'OnDestroy()', { color: '#ff6b6b' }],
    ],
    edges: [
      ['aw', 'en'], ['en', 'st'], ['st', 'fu'], ['fu', 'tr', '', 'right', 'left'], ['fu', 'up'], ['up', 'co', '', 'right', 'left'], ['up', 'lu'], ['lu', 'dq'],
      ['dq', 'fu', $t('Hayır · sonraki kare'), 'left', 'left'], ['dq', 'di', YES], ['di', 'de'],
    ],
  }), { icon: 'flow' });
  add('unityflow', 'inputmove', $t('Update: Input → Hareket'), flow({
    nodes: [
      ['s', 'terminator', 0, 0, 'Update()', { color: UNITY }],
      ['in', 'io', 0, 1, $t('Input oku\nGetAxis("Horizontal")')],
      ['d', 'decision', 0, 2, 'input != 0 ?'],
      ['dir', 'process', 0, 3, $t('Yönü hesapla\n(normalize)')],
      ['mv', 'process', 0, 4, 'rb.velocity = dir * speed'],
      ['idle', 'process', 1, 3, $t('Idle animasyonu')],
      ['e', 'terminator', 0, 5, $t('Kare sonu')],
    ],
    edges: [['s', 'in'], ['in', 'd'], ['d', 'dir', YES], ['d', 'idle', NO, 'right', 'top'], ['dir', 'mv'], ['mv', 'e'], ['idle', 'e', '', 'bottom', 'right']],
  }), { icon: 'flow' });
  add('unityflow', 'for', $t('for Döngüsü'), flow({
    nodes: [
      ['init', 'process', 0, 0, 'int i = 0'],
      ['c', 'decision', 0, 1, 'i < count ?'],
      ['body', 'process', 0, 2, $t('Döngü gövdesi\nenemies[i].Tick()')],
      ['inc', 'process', 0, 3, 'i++'],
      ['out', 'terminator', 1, 1, LOOP_DONE, { color: '#8e9bb0' }],
    ],
    edges: [['init', 'c'], ['c', 'body', 'true'], ['body', 'inc'], ['inc', 'c', '', 'left', 'left'], ['c', 'out', 'false', 'right', 'left']],
  }), { icon: 'loop' });
  add('unityflow', 'foreach', $t('foreach Döngüsü'), flow({
    nodes: [
      ['loop', 'preparation', 0, 0, 'foreach (var enemy\nin enemies)', { h: 64 }],
      ['body', 'process', 0, 1, 'enemy.TakeDamage(10)'],
      ['out', 'terminator', 1, 0, LOOP_DONE, { color: '#8e9bb0' }],
    ],
    edges: [['loop', 'body', $t('sıradaki')], ['body', 'loop', '', 'left', 'left'], ['loop', 'out', $t('bitti'), 'right', 'left']],
  }), { icon: 'loop' });
  add('unityflow', 'while', $t('while Döngüsü'), flow({
    nodes: [
      ['c', 'decision', 0, 0, 'isAlive ?'],
      ['body', 'process', 0, 1, $t('Gövde')],
      ['out', 'terminator', 1, 0, LOOP_DONE, { color: '#8e9bb0' }],
    ],
    edges: [['c', 'body', 'true'], ['body', 'c', '', 'left', 'left'], ['c', 'out', 'false', 'right', 'left']],
  }), { icon: 'loop' });
  add('unityflow', 'dowhile', $t('do-while Döngüsü'), flow({
    nodes: [
      ['body', 'process', 0, 0, $t('Gövde')],
      ['c', 'decision', 0, 1, $t('koşul ?')],
      ['out', 'terminator', 0, 2, LOOP_DONE, { color: '#8e9bb0' }],
    ],
    edges: [['body', 'c'], ['c', 'body', 'true', 'left', 'left'], ['c', 'out', 'false']],
  }), { icon: 'loop' });
  add('unityflow', 'ifelse', 'if / else', flow({
    nodes: [
      ['c', 'decision', 0.5, 0, $t('koşul ?')],
      ['a', 'process', 0, 1, $t('if bloğu')],
      ['b', 'process', 1, 1, $t('else bloğu')],
      ['m', 'connector', 0.5, 2, ''],
    ],
    edges: [['c', 'a', 'true', 'left', 'top'], ['c', 'b', 'false', 'right', 'top'], ['a', 'm', '', 'bottom', 'left'], ['b', 'm', '', 'bottom', 'right']],
  }), { icon: 'flow' });
  add('unityflow', 'switch', 'switch', flow({
    nodes: [
      ['c', 'decision', 1.5, 0, 'switch (state)'],
      ['a', 'process', 0, 1.2, 'case Idle:\nPatrol()'],
      ['b', 'process', 1, 1.2, 'case Chase:\nMoveTo(target)'],
      ['d', 'process', 2, 1.2, 'case Attack:\nAttack()'],
      ['x', 'process', 3, 1.2, 'default:\nbreak'],
      ['m', 'connector', 1.5, 2.2, ''],
    ],
    edges: [
      ['c', 'a', 'Idle', 'bottom', 'top'], ['c', 'b', 'Chase', 'bottom', 'top'], ['c', 'd', 'Attack', 'bottom', 'top'], ['c', 'x', 'default', 'bottom', 'top'],
      ['a', 'm', '', 'bottom', 'top'], ['b', 'm', '', 'bottom', 'top'], ['d', 'm', '', 'bottom', 'top'], ['x', 'm', '', 'bottom', 'top'],
    ],
  }), { icon: 'flow' });
  add('unityflow', 'coroutine', 'Coroutine (Spawn)', flow({
    nodes: [
      ['s', 'terminator', 0, 0, 'StartCoroutine(Spawn())', { color: UNITY, w: 200 }],
      ['sp', 'process', 0, 1, 'Instantiate(enemyPrefab)\nspawned++'],
      ['w', 'preparation', 0, 2, 'yield return new\nWaitForSeconds(2f)', { w: 190, h: 64 }],
      ['c', 'decision', 0, 3, 'spawned < max ?'],
      ['e', 'terminator', 1, 3, 'yield break', { color: '#8e9bb0' }],
    ],
    edges: [['s', 'sp'], ['sp', 'w'], ['w', 'c'], ['c', 'sp', 'true', 'left', 'left'], ['c', 'e', 'false', 'right', 'left']],
  }), { icon: 'flow' });
  add('unityflow', 'trigger', 'OnTriggerEnter', flow({
    nodes: [
      ['s', 'terminator', 0, 0, 'OnTriggerEnter(Collider other)', { color: UNITY, w: 230 }],
      ['t', 'decision', 0, 1, 'other.CompareTag\n("Player") ?', { w: 190, h: 96 }],
      ['g', 'process', 0, 2, 'other.TryGetComponent\n(out IDamageable d)', { w: 190 }],
      ['f', 'decision', 0, 3, $t('bulundu mu?')],
      ['dmg', 'process', 0, 4, 'd.TakeDamage(damage)'],
      ['e', 'terminator', 1, 4.9, 'return', { color: '#8e9bb0' }],
    ],
    edges: [['s', 't'], ['t', 'g', YES], ['t', 'e', NO, 'right', 'top'], ['g', 'f'], ['f', 'dmg', YES], ['f', 'e', NO, 'right', 'top'], ['dmg', 'e', '', 'bottom', 'left']],
  }), { icon: 'flow' });
  add('unityflow', 'damage', $t('Hasar Al / Öl'), flow({
    nodes: [
      ['s', 'terminator', 0, 0, 'TakeDamage(amount)', { color: UNITY, w: 180 }],
      ['h', 'process', 0, 1, 'health -= amount'],
      ['ev', 'io', 0, 2, 'OnHealthChanged\n?.Invoke(health)', { w: 190 }],
      ['c', 'decision', 0, 3, 'health <= 0 ?'],
      ['die', 'subprocess', 1, 3, $t('Die()\nanimasyon + Destroy')],
      ['e', 'terminator', 0, 4, $t('Bitti'), { color: '#8e9bb0' }],
    ],
    edges: [['s', 'h'], ['h', 'ev'], ['ev', 'c'], ['c', 'die', YES, 'right', 'left'], ['c', 'e', NO], ['die', 'e', '', 'bottom', 'right']],
  }), { icon: 'flow' });
  add('unityflow', 'raycast', $t('Ateş Et (Raycast)'), flow({
    nodes: [
      ['s', 'terminator', 0, 0, 'Update()', { color: UNITY }],
      ['c', 'decision', 0, 1, $t('Fire1 basılı &\ncooldown bitti?'), { w: 190, h: 96 }],
      ['r', 'process', 0, 2, 'Physics.Raycast(\nray, out hit, range)', { w: 190 }],
      ['h', 'decision', 0, 3, $t('isabet var mı?')],
      ['fx', 'process', 0, 4, $t('Hasar ver +\nisabet efekti')],
      ['cd', 'process', 1, 4, 'nextFire = Time.time\n+ fireRate', { w: 180 }],
      ['e', 'terminator', 1, 5, $t('Kare sonu'), { color: '#8e9bb0' }],
    ],
    edges: [['s', 'c'], ['c', 'r', YES], ['c', 'e', NO, 'right', 'right'], ['r', 'h'], ['h', 'fx', YES], ['h', 'cd', NO, 'right', 'top'], ['fx', 'cd', '', 'right', 'left'], ['cd', 'e']],
  }), { icon: 'flow' });

  /* ---------------- Oyun diyalogları ---------------- */
  /* Diyalog parçacığı: düğümler [id, tür, özellikler], kenarlar [kaynak, hedef, seçenek id | 'true' | 'false'].
     Birden fazla düğüm varsa eklenirken otomatik yerleşir. */
  function dlg(spec) {
    return () => {
      const nodes = spec.nodes.map(([id, type, props]) => Object.assign({ id, type, x: 0, y: 0, w: SH[type].w, h: SH[type].h }, App.Dialogue.defaults(type), U.clone(props || {})));
      const edges = (spec.edges || []).map(([from, to, port], i) => {
        const e = { id: 'e' + i, from, to, type: 'flow', label: '' };
        if (port === 'true' || port === 'false') e.branch = port;
        else if (port) e.opt = port;
        return e;
      });
      return { nodes, edges, layout: nodes.length > 1, characters: U.clone(spec.characters || []), variables: U.clone(spec.variables || []) };
    };
  }
  const opt = (id, text, cond, maxPicks) => Object.assign({ id, text, cond: cond || '' }, maxPicks ? { maxPicks: maxPicks === true ? 1 : maxPicks } : {});

  add('dialogue', 'dlgStart', $t('Başlangıç'), dlg({ nodes: [['a', 'dlgStart', { text: $t('Yeni diyalog'), dlgId: 'new_dialogue' }]] }), { icon: 'dlgStart', alt: 'start entry' });
  add('dialogue', 'dlgLine', $t('Replik'), dlg({ nodes: [['a', 'dlgLine', { text: $t('Merhaba yolcu!') }]] }), { icon: 'dlgLine', alt: 'line npc speech' });
  add('dialogue', 'dlgChoice', $t('Oyuncu Seçimi'), dlg({ nodes: [['a', 'dlgChoice', { options: [opt('o1', $t('Evet')), opt('o2', $t('Hayır'))] }]] }), { icon: 'dlgChoice', alt: 'choice option player' });
  add('dialogue', 'dlgBranch', $t('Koşul'), dlg({ nodes: [['a', 'dlgBranch', { cond: 'gold >= 50' }]] }), { icon: 'dlgBranch', alt: 'condition if branch' });
  add('dialogue', 'dlgAction', $t('Olay / Değişken'), dlg({ nodes: [['a', 'dlgAction', { actions: 'gold -= 50\n@give_item sword' }]] }), { icon: 'dlgAction', alt: 'action event set variable' });
  add('dialogue', 'dlgJump', $t('Diyaloğa Atla'), dlg({ nodes: [['a', 'dlgJump', { target: '' }]] }), { icon: 'dlgJump', alt: 'jump goto' });
  add('dialogue', 'dlgEnd', $t('Bitiş'), dlg({ nodes: [['a', 'dlgEnd', { text: '' }]] }), { icon: 'dlgEnd', alt: 'end exit' });
  add('dialogue', 'dlgNote', $t('Not'), shape('note', { text: $t('Tasarım notu…') }), { icon: 'note' });
  add('dialogue', 'dlgFrame', $t('Grup / Sahne'), shape('frame', { text: $t('Sahne') }), { icon: 'frame' });

  const GUARD = { id: 'guard', name: $t('Muhafız'), color: '#f5a623' };
  add('dlgpatterns', 'dlgGreeting', $t('Selamlama ve sorular'), dlg({
    characters: [GUARD],
    nodes: [
      ['s', 'dlgStart', { text: $t('Kapı muhafızı'), dlgId: 'gate_guard' }],
      ['l1', 'dlgLine', { speaker: 'guard', text: $t('Dur! Şehre girmek isteyen herkes buradan geçer.') }],
      ['c', 'dlgChoice', { options: [opt('o1', $t('Sen kimsin?')), opt('o2', $t('Şehirde neler oluyor?'), '', true), opt('o3', $t('Geçmeme izin ver.'))] }],
      ['r1', 'dlgLine', { speaker: 'guard', text: $t('Kralın muhafızıyım. Yirmi yıldır bu kapıyı bekliyorum.') }],
      ['r2', 'dlgLine', { speaker: 'guard', text: $t('Kuzeyde kurt sürüleri görülmüş. Dikkatli ol.'), emotion: 'worried' }],
      ['r3', 'dlgLine', { speaker: 'guard', text: $t('Peki. Başını belaya sokma.') }],
      ['e', 'dlgEnd', { text: 'passed_gate' }],
    ],
    edges: [['s', 'l1'], ['l1', 'c'], ['c', 'r1', 'o1'], ['c', 'r2', 'o2'], ['c', 'r3', 'o3'], ['r1', 'c'], ['r2', 'c'], ['r3', 'e']],
  }), { icon: 'dlgPattern', alt: 'greeting questions loop' });
  add('dlgpatterns', 'dlgShop', $t('Tüccar: altın kontrolü'), dlg({
    characters: [{ id: 'merchant', name: $t('Tüccar'), color: '#3ecf8e' }],
    variables: [{ name: 'gold', type: 'number', value: '40' }, { name: 'hasSword', type: 'bool', value: 'false' }],
    nodes: [
      ['s', 'dlgStart', { text: $t('Silah tüccarı'), dlgId: 'weapon_shop' }],
      ['l1', 'dlgLine', { speaker: 'merchant', text: $t('Bu çelik kılıç 50 altın. Kesende {gold} altın var gibi görünüyor.') }],
      ['c', 'dlgChoice', { options: [opt('o1', $t('Satın al (50 altın)'), 'gold >= 50 and not hasSword'), opt('o2', $t('Çok pahalı, sonra gelirim.'))] }],
      ['a', 'dlgAction', { actions: 'gold -= 50\nhasSword = true\n@give_item steel_sword 1' }],
      ['l2', 'dlgLine', { speaker: 'merchant', text: $t('İyi günlerde kullan!'), emotion: 'happy' }],
      ['l3', 'dlgLine', { speaker: 'merchant', text: $t('Paran olunca yine gel.') }],
      ['e1', 'dlgEnd', { text: 'bought_sword' }],
      ['e2', 'dlgEnd', { text: 'left_shop' }],
    ],
    edges: [['s', 'l1'], ['l1', 'c'], ['c', 'a', 'o1'], ['a', 'l2'], ['l2', 'e1'], ['c', 'l3', 'o2'], ['l3', 'e2']],
  }), { icon: 'dlgPattern', alt: 'shop merchant buy gold' });
  add('dlgpatterns', 'dlgQuest', $t('Görev ver / kabul et'), dlg({
    characters: [{ id: 'elder', name: $t('Köy Yaşlısı'), color: '#b26bff' }],
    variables: [{ name: 'wolfQuest', type: 'number', value: '0' }],
    nodes: [
      ['s', 'dlgStart', { text: $t('Kurt görevi'), dlgId: 'wolf_quest' }],
      ['b', 'dlgBranch', { cond: 'wolfQuest == 1' }],
      ['l0', 'dlgLine', { speaker: 'elder', text: $t('Kurtları hallettin mi? Köy hâlâ tehlikede.'), emotion: 'worried' }],
      ['l1', 'dlgLine', { speaker: 'elder', text: $t('Yabancı, köyümüzü kurtlar basıyor. Bize yardım eder misin?'), emotion: 'sad' }],
      ['c', 'dlgChoice', { options: [opt('o1', $t('Elbette, yardım ederim.')), opt('o2', $t('Bu benim sorunum değil.'))] }],
      ['a', 'dlgAction', { actions: 'wolfQuest = 1\n@start_quest wolves' }],
      ['l2', 'dlgLine', { speaker: 'elder', text: $t('Sağ ol! Kurtlar kuzeydeki ormanda.'), emotion: 'happy' }],
      ['l3', 'dlgLine', { speaker: 'elder', text: $t('Anlıyorum... Fikrini değiştirirsen buradayım.'), emotion: 'sad' }],
      ['e0', 'dlgEnd', { text: 'reminded' }],
      ['e1', 'dlgEnd', { text: 'quest_accepted' }],
      ['e2', 'dlgEnd', { text: 'quest_declined' }],
    ],
    edges: [['s', 'b'], ['b', 'l0', 'true'], ['b', 'l1', 'false'], ['l0', 'e0'], ['l1', 'c'], ['c', 'a', 'o1'], ['a', 'l2'], ['l2', 'e1'], ['c', 'l3', 'o2'], ['l3', 'e2']],
  }), { icon: 'dlgPattern', alt: 'quest accept decline' });
  add('dlgpatterns', 'dlgOnce', $t('İlk karşılaşma / tekrar'), dlg({
    characters: [{ id: 'innkeeper', name: $t('Hancı'), color: '#ff8a65' }],
    variables: [{ name: 'metInnkeeper', type: 'bool', value: 'false' }],
    nodes: [
      ['s', 'dlgStart', { text: $t('Hancı'), dlgId: 'innkeeper' }],
      ['b', 'dlgBranch', { cond: 'metInnkeeper' }],
      ['l1', 'dlgLine', { speaker: 'innkeeper', text: $t('Yine hoş geldin! Her zamankinden mi?'), emotion: 'happy' }],
      ['a', 'dlgAction', { actions: 'metInnkeeper = true' }],
      ['l2', 'dlgLine', { speaker: 'innkeeper', text: $t('Hoş geldin yabancı! Seni daha önce buralarda görmedim.') }],
      ['e', 'dlgEnd', { text: '' }],
    ],
    edges: [['s', 'b'], ['b', 'l1', 'true'], ['b', 'a', 'false'], ['a', 'l2'], ['l1', 'e'], ['l2', 'e']],
  }), { icon: 'dlgPattern', alt: 'first meeting once flag' });

  const SECTIONS = [
    { id: 'uml', label: 'UML' },
    { id: 'flow', label: $t('Akış Şeması') },
    { id: 'unity', label: $t('Unity Sınıfları') },
    { id: 'patterns', label: $t('Unity Desenleri') },
    { id: 'unityflow', label: $t('Unity Akışları & Döngüler') },
    // yalnızca diyalog sekmelerinde görünür
    { id: 'dialogue', label: $t('Diyalog'), dlg: true },
    { id: 'dlgpatterns', label: $t('Hazır Diyaloglar'), dlg: true },
  ];

  /* Unity hazır üye kısayolları (panel menüleri için) */
  const UNITY_METHODS = [
    { group: $t('Yaşam döngüsü'), items: ['- Awake() : void', '- OnEnable() : void', '- Start() : void', '- Update() : void', '- FixedUpdate() : void', '- LateUpdate() : void', '- OnDisable() : void', '- OnDestroy() : void'] },
    { group: $t('Fizik 3D'), items: ['- OnTriggerEnter(other : Collider) : void', '- OnTriggerExit(other : Collider) : void', '- OnTriggerStay(other : Collider) : void', '- OnCollisionEnter(collision : Collision) : void', '- OnCollisionExit(collision : Collision) : void'] },
    { group: $t('Fizik 2D'), items: ['- OnTriggerEnter2D(other : Collider2D) : void', '- OnTriggerExit2D(other : Collider2D) : void', '- OnCollisionEnter2D(collision : Collision2D) : void', '- OnCollisionExit2D(collision : Collision2D) : void'] },
    { group: $t('Diğer'), items: ['- OnValidate() : void', '- Reset() : void', '- OnDrawGizmos() : void', '- OnDrawGizmosSelected() : void', '- OnApplicationQuit() : void', '- OnBecameVisible() : void', '- OnBecameInvisible() : void', '- OnMouseDown() : void'] },
    { group: 'Coroutine', items: ['- Routine() : IEnumerator', '- SpawnLoop() : IEnumerator'] },
  ];
  const UNITY_FIELDS = [
    { group: $t('Bileşenler'), items: ['- rb : Rigidbody', '- rb2D : Rigidbody2D', '- animator : Animator', '- col : Collider', '- spriteRenderer : SpriteRenderer', '- audioSource : AudioSource', '- agent : NavMeshAgent', '- cam : Camera'] },
    { group: $t('Değerler'), items: ['- speed : float = 5f', '- jumpForce : float = 7f', '- maxHealth : int = 100', '- groundMask : LayerMask', '- prefab : GameObject', '- target : Transform', '- spawnPoints : Transform[]'] },
    { group: $t('Olaylar'), items: ['+ onDeath : UnityEvent', '+ OnValueChanged : event Action<int>', '+ OnStateChanged : event Action<GameState>'] },
    { group: $t('Özellikler'), items: ['+ {static} Instance : GameManager {get; private set;}', '+ IsGrounded : bool {get; private set;}'] },
  ];

  /* Karakter sayfasındaki karakterler: palette sürüklenince kişi kartı olur */
  function charItem(cid) {
    const c = App.Dialogue.character(App.Store.doc, cid);
    if (!c) return null;
    return {
      section: 'characters', id: 'char:' + cid, label: c.name, alt: (c.role || '') + ' ' + cid, icon: 'char', color: c.color, portrait: c.portrait,
      build: () => single(Object.assign({ type: 'dlgCard', w: SH.dlgCard.w, h: SH.dlgCard.h }, App.Dialogue.defaults('dlgCard'), { charId: cid })),
    };
  }
  const characterItems = () => App.Dialogue.reg(App.Store.doc).characters.map((c) => charItem(c.id));

  App.Templates = { items, SECTIONS, UNITY_METHODS, UNITY_FIELDS, characterItems, byId: (id) => (String(id).startsWith('char:') ? charItem(String(id).slice(5)) : items.find((i) => i.id === id)) };
})(typeof window !== 'undefined' ? window : globalThis);
